// شاشة فرز الطلب الوارد: المحادثة، تحليل الذكاء الاصطناعي (مساعد فقط)، بيانات الفرز، العميل الموحد عبر القنوات،
// ثم قرار الإدارة: تحويل إلى ملف قانوني له كود مستقل، أو تعامل داخلي دون محامٍ، أو أرشفة.

import { h, frag, mount } from '../../../lib/h.js';
import { api, downloadUrl, formatBytes } from '../../../lib/api.js';
import { label, areaLabel, areaOptions, options, governorateOptions, relative, dateTime, date, percent, count, toLatinDigits, cairoToday, localPhone } from '../../../lib/fmt.js';
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
import { channelIcons, similarText, CHANNEL_ICONS, reloadAndFocus, replaceQuery } from './inbox.js';
import { pickClient } from './clients.js';
import { beneficiaryCard } from '../../components/beneficiary.js'; // v9 practice
import { programSelect } from '../../components/program-picker.js';
import { MERGE_LABEL, mergeLabel } from '../../labels.js';
// v9: ردود جاهزة واقتراح رد بالذكاء الاصطناعي في محرر الرد، وتحليل المستندات (أدوات مشتركة مع صفحة الملف)
import { composerTools, docAnalysisStore, docAiBadge, docAiAction, docAiResultsCard } from './case-detail.js';
// v9.2 (admin-ai): القصة ← اقتراح ← طلب بنقرة؛ نصوص الرسائل الصوتية؛ المكالمات
import { openStorySheet } from '../../components/story-sheet.js';
import { voiceTranscriptEditor, voiceLeftText } from '../../components/voice-transcript.js';
import { openCallNote, openCallAttempt, attemptsList, closeUnreachable, attemptsCountText } from '../../components/call-note.js';
// v11 segment-staff (ST-2): نوع الخدمة في ترويسة الطلب، بطاقة «غير محدد»، ورأس الإرسال «سيُرسل من»
import {
  segmentChip,
  sourceText,
  mismatchChip,
  lineMismatchChip,
  unknownLineChip,
  unknownLineText,
  undeterminedCard,
  openSegmentSheet,
  sendHeader,
  segmentChoice,
  segLabel,
  clientNoun,
  pronounOf,
  ON_CASE_HINT,
  REQUIRED_TEXT,
} from '../../components/segment-ui.js';

const OPEN = ['new', 'in_review', 'awaiting_client'];
/** (إصلاح 9.1) اسم عام لا يقول ما في الورقة: «ورقة 1»، «ورقة-2.jpg»، «صورة 3»، «IMG_2041.jpg» */
export const GENERIC_DOC_NAME = /^\s*(?:ورقة|ورقه|صورة|صوره|مستند|مرفق|IMG|image|photo|scan|document|file|DSC|PXL|WhatsApp Image)[\s_-]*[\d\s_.:-]*(?:at[\d\s_.:-]*)?(?:\.(?:jpe?g|png|webp|heic|pdf))?\s*$/i;
// v11 gate fix (J-13/V13): «آخر قناة تواصل منها العميل/ة» لطلب أفراد وشركات
const replyChannelsFor = (noun = 'المستفيد/ة') => [
  { value: 'auto', label: `تلقائي (آخر قناة تواصل منها ${noun})` },
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
  // v11 gate fix J-02: اختيار الزائر في الموقع وطريقة تحديده بالعربية لا بمفاتيح خام
  gate: 'اختيار الزائر',
  gate_via: 'طريقة التحديد',
};
const SOURCE_TYPE_LABELS = { ad: 'إعلان ممول', post: 'منشور' };
const INTAKE_MODE_LABELS = { form: 'نموذج منظم', guided: 'خطوة بخطوة' };
export const GATE_VIA_LABELS = { param: 'من رابط الصفحة', cookie: 'اختيار سابق محفوظ في المتصفح', default: 'الإعداد الافتراضي للموقع' };
// مفاتيح داخلية في source_detail (التحقق من الهوية) تُعرض بتنبيه مخصص لا كصفوف خام
// (v9.1 b-forms) وكود تأكيد الرقم برسالة واتساب (confirm_*) لا يُعرض كذلك
// (v11 gate fix J-02) وبيانات الشركة صاحبة طلب العرض (requester) تظهر في بطاقة «طلب عرض من شركة» لا هنا
export const isInternalSourceKey = (k) => k === 'phone_match_unverified' || k === 'requester' || k.startsWith('identity_') || k.startsWith('confirm_');
/** (v11 gate fix J-02) قيمة صف المصدر بالعربية؛ النص الخام فقط لما لا نعرف معناه. */
export function sourceDetailValue(k, v) {
  if (k === 'source_type') return SOURCE_TYPE_LABELS[v] || String(v);
  if (k === 'intake_mode') return INTAKE_MODE_LABELS[v] || String(v);
  if (k === 'gate') return v === 'charity' || v === 'paid' ? segLabel('segment', v) : String(v);
  if (k === 'gate_via') return GATE_VIA_LABELS[v] || String(v);
  return null;
}

// v11 gate fix (K1): لا أخضر ولا ذهبي لغير رقاقة نوع الخدمة — نفس درجات actor_kind في STATUS_TONES
const ACTOR_TONES = { ai: 'info', client: 'neutral', staff: 'neutral', lawyer: 'info', system: 'muted' };

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
  // v9.2 (admin-ai): حالة القصة واقتراح المسار والرسائل الصوتية ومحاولات الاتصال
  const story = d.story || null;
  const prop = isOpen ? d.proposal || null : null;
  const webForm = d.form || null;
  const voiceNotes = d.voice_notes || [];
  const voiceByDoc = new Map(voiceNotes.map((n) => [n.document_id, n]));
  const localAi = !(d.ai_status && d.ai_status.provider === 'anthropic');
  const callNotes = (d.messages || []).filter((m) => m.direction === 'in' && m.meta && m.meta.call_note);
  const lastCallNoteId = callNotes.length ? callNotes[callNotes.length - 1].id : null;
  const herPhone = (cl && cl.phone) || it.contact_phone || null;

  const base = `/admin/intakes/${it.id}`;
  // v11 segment-staff: كتلة نوع الخدمة من الخادم (§5.6) — القيمة والمصدر والاقتراح والخط الذي وصلت عليه
  const seg = d.segment || { value: it.segment ?? null, can_change: !it.case_id, block: it.case_id ? 'segment_on_case' : null };
  const segValue = seg.value || null;
  const isPaid = segValue === 'paid';
  const unknownLine = seg.wa_line === 'unknown' || (d.send_line && d.send_line.key === 'unknown');
  const requester = seg.requester || null;
  const sendInfo = { segment: segValue, tone: d.tone || null, sendLine: d.send_line || null, requesterKind: requester ? 'company' : null };
  // v11 gate fix (J-13/V13): اسم صاحب الطلب في نصوص الإدارة حسب النوع — «المستفيد/ة» / «العميل/ة» / «الشركة» (طلب عرض)
  const N = clientNoun(segValue, { company: Boolean(requester) });
  const REPLY_CHANNELS = replyChannelsFor(N.def);
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

  // ───────────── v11 segment-staff (ST-2): نوع الخدمة ─────────────
  function changeSegment() {
    return openSegmentSheet({
      kind: 'intake',
      id: it.id,
      current: segValue,
      hint: seg.hint || null,
      changeMessage: seg.change_message || null,
      onSaved: () => reloadAndFocus(ctx, '.seg-head .seg-change'),
    });
  }

  /** سطر النوع في الترويسة: الرقاقة + المصدر («أفراد وشركات · رقم واتساب المخصص») + «تغيير» (أو «من صفحة الملف») */
  function segHead() {
    const change =
      seg.can_change !== false
        ? button('تغيير', { variant: 'ghost', size: 'sm', icon: 'swap', className: 'seg-change', ariaLabel: 'تغيير نوع الخدمة', onClick: changeSegment })
        : h('span.seg-on-case', ON_CASE_HINT, d.case ? [' ', h('a', { href: `#/cases/${d.case.id}` }, codeTag(d.case.code))] : null);
    return h(
      'div.seg-head',
      segmentChip(segValue, { source: seg.source, sourceLabel: seg.source_label, requesterKind: requester ? 'company' : null, size: 'label' }),
      // v11 gate fix (J-12): «تغيير» بجوار الرقاقة مباشرة فيبقى على سطرها في الهاتف، والمصدر بعده
      change,
      sourceText(seg) && h('span.seg-src', sourceText(seg)),
      // r2 S14: طلب خيري نصه يقول أفراد/شركة — اقتراح لا يُطبَّق
      segValue === 'charity' && seg.mismatch_hint ? mismatchChip({ segment: 'paid', reasons: seg.mismatch_hint.reasons }) : null,
      // r2 S7: كتب على رقم الجانب الآخر وأُلحقت رسالته بهذا الطلب
      seg.line_mismatch ? lineMismatchChip(seg.line_mismatch) : null,
      // r2 S8: وصلت على رقم غير مضبوط — لا رد تلقائي ولا واتساب من هنا
      unknownLine ? unknownLineChip(seg.wa_pid_last4) : null,
    );
  }

  /** طلب عرض من شركة (G11-45): بيانات مقدّم الطلب و«إضافة كشركة عميلة» (تعبئة مسبقة فقط) */
  function requesterCard() {
    if (!requester) return null;
    const phone = (cl && cl.phone) || it.contact_phone || '';
    const q = new URLSearchParams({ new: '1', name: requester.company_name || '', phone: phone ? localPhone(phone) : '' });
    const rows = [
      ['اسم الشركة', requester.company_name],
      ['صفة مقدّم الطلب', requester.job_title],
      ['البريد الإلكتروني', requester.email ? ltr(requester.email) : null],
      ['عدد الموظفين', requester.employees_label ? ltr(requester.employees_label) : null],
      ['ما تحتاجه الشركة', requester.needs_labels && requester.needs_labels.length ? requester.needs_labels.join('، ') : null],
    ].filter(([, v]) => v);
    // v11 gate fix (J-15): بطاقة «طلب عرض — تواصل تجاري» أول الصفحة بدل التحليل القانوني (لا عنوان ولا مسار مقترح لطلب عرض)
    return card({
      title: 'طلب عرض — تواصل تجاري',
      subtitle: 'طلب عرض من شركة: تواصلوا معها تجاريًا، ثم أضيفوها كشركة عميلة. لا تحليل قانوني لهذا الطلب.',
      icon: 'building',
      className: 'seg-requester',
      body: h('div.stack-sm', kv(rows), h('div.btn-group', button('إضافة كشركة عميلة', { variant: 'primary', icon: 'building', href: `#/companies?${q.toString()}` }))),
    });
  }

  // ───────────── التحقق من هوية المرسل ─────────────
  async function confirmIdentity() {
    const ok = await confirmDialog({
      title: 'تأكيد هوية المرسل',
      message: `أكّد فقط بعد التحقق من أن مقدم الطلب هو صاحب رقم الهاتف المسجل (مثلًا بمكالمة على الرقم أو برسالة منه عبر واتساب). بعد التأكيد يُعامل الطلب كطلب من ${N.def} نفسه.`,
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
      message: `ستتوقف روابط البوابة الخاصة بهذا الطلب فورًا، ولن يستطيع من يملكها متابعة الطلب أو الاطلاع على رسائله. يمكن إنشاء رابط جديد لاحقًا من ملف ${N.def} بعد التحقق.`,
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
          h('p', `رقم الهاتف أُدخل من نموذج الموقع ويطابق ${N.acc} مسجلًا، ولم يُثبت أن المرسل هو صاحب الرقم. لا تُرسل معلومات عن ملفات ${N.def} الأخرى قبل التحقق.`),
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
          h('span', 'قررت الإدارة أن هذا الطلب يستحق ملفًا قانونيًا، وصدر له الكود ', d.case ? codeTag(d.case.code) : null, `. تستمر المحادثة مع ${N.def} داخل الملف.`),
          d.case && button('فتح الملف', { variant: 'primary', size: 'sm', icon: 'briefcase', href: `#/cases/${d.case.id}` }),
        ),
        'success',
        { title: 'تحوّل الطلب إلى ملف قانوني', icon: 'checkCircle' },
      );
    }
    if (it.status === 'handled_internally' || it.status === 'archived') {
      const handled = it.status === 'handled_internally';
      // v9.2: نوع الإغلاق (رد بمعلومة · توجيه لجهة أخرى · تعذّر الوصول إليها) والجهة الموجَّهة إليها
      const kind = handled ? it.resolution_kind : null;
      const title = !handled
        ? 'الطلب مؤرشف'
        : kind === 'unreachable'
          ? 'أُغلق الطلب: تعذّر الوصول إليها'
          : kind === 'referral'
            ? 'أُغلق الطلب بتوجيهها لجهة أخرى'
            : 'تعاملت الإدارة مع الطلب داخليًا دون إسناده لمحامٍ';
      return alertBox(
        h(
          'div.pa-alert-row',
          h(
            'span.pa-closed-lines',
            h('span', h('span.pa-alert-label', handled ? 'ملخص ما تم: ' : 'سبب الأرشفة: '), it.resolution_note || '—'),
            kind && h('span.small', h('span.pa-alert-label', 'نوع الإغلاق: '), label('resolution_kind', kind)),
            kind === 'referral' && it.referral_to && h('span.small', h('span.pa-alert-label', 'الجهة: '), it.referral_to),
          ),
          button('إعادة فتح الطلب', { size: 'sm', icon: 'refresh', onClick: reopen }),
        ),
        handled ? 'success' : 'info',
        { title, icon: handled ? 'checkCircle' : 'info' },
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
      intro: `استخدم هذا الخيار للاستفسارات البسيطة التي تجيب عنها الإدارة مباشرة. يُغلق الطلب ويُسجل ما تم في سجل ${N.def}، ولا يُصدر له كود ملف.`,
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
        { name: 'reply', label: `رد يُرسل ${N.li} (اختياري)`, type: 'textarea', maxLength: 4000, rows: 4, hint: 'اتركه فارغًا إذا كنت قد رددت عليه بالفعل في المحادثة أو هاتفيًا.' },
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
      intro: `تُستخدم الأرشفة للرسائل غير الجدية أو المكررة أو الخارجة عن نطاق الخدمة. يبقى الطلب محفوظًا ويمكن إعادة فتحه إذا تواصل ${N.def} مجددًا.`,
      submitLabel: 'أرشفة الطلب',
      fields: [{ name: 'reason', label: 'سبب الأرشفة', type: 'textarea', required: true, minLength: 3, maxLength: 500, rows: 3 }],
      onSubmit: (v) => api.post(`${base}/archive`, { reason: v.reason }),
    });
    if (res) {
      toast('تمت أرشفة الطلب', 'success');
      await reloadAndFocus(ctx, '#pa-decision');
    }
  }

  // ───────────── v9.2 (admin-ai): «تحويل القصة إلى طلب» (A92-18) ─────────────
  const MINUTES = ['دقيقة واحدة', 'دقيقتين', 'دقائق', 'دقيقة'];

  function storyRibbon(view) {
    const st = story || {};
    const quiet = Number(st.quiet_minutes) || 10;
    const line = (b, text) => h('div.pa-story-ribbon', { class: `is-${view}` }, b, text ? h('span.pa-story-ribbon-text', text) : null);
    switch (view) {
      case 'callback':
        return line(badge('طلبت مكالمة', 'info', { icon: 'phone' }), `لم تحكِ مشكلتها بعد — الوقت المناسب: ${(webForm && webForm.callback_label) || 'أي وقت'}`);
      case 'collecting':
        return line(
          h('span.badge.badge-info.pa-story-live', h('span.pa-live-dot', { 'aria-hidden': 'true' }), h('span', 'القصة لسه بتتكتب…')),
          `آخر رسالة ${relative(it.last_inbound_at || it.last_message_at || it.created_at)} — تُلخَّص تلقائيًا بعد ${count(quiet, MINUTES)} بلا رسائل`,
        );
      case 'blocked':
        return line(badge(st.media_failed ? 'تعذّر تنزيل رسالة صوتية' : 'فيها رسالة صوتية لم تُكتب', 'warning', { icon: 'mic' }), null);
      case 'stale':
        return line(badge(`وصل جديد بعد الملخص (${Number(st.new_since_summary) || 0})`, 'warning', { icon: 'refresh' }), null);
      case 'awaiting':
        return line(badge('بانتظار ردها', 'neutral', { icon: 'clock' }), null);
      default:
        return line(badge('جاهزة للقرار', 'success', { icon: 'checkCircle' }), prop && prop.analyzed_at ? `اتلخّصت ${relative(prop.analyzed_at)}` : null);
    }
  }

  function sheet(extra = {}) {
    return openStorySheet({
      intakeId: it.id,
      proposal: prop,
      name: it.contact_name || (cl && cl.name) || null,
      staff: d.staff,
      userId: ctx.user && ctx.user.id,
      callNoteId: lastCallNoteId,
      phone: herPhone,
      segmentHint: seg.hint || null, // v11 segment-staff: اقتراح النوع لطلب «غير محدد»
      requesterKind: requester ? 'company' : null,
      onDone: (res) => {
        if (res && res.next && res.next !== `#/inbox/${it.id}`) ctx.navigate(res.next);
        else reloadAndFocus(ctx, '#pa-decision');
      },
      onCalled: () => reloadAndFocus(ctx, '#pa-proposal'),
      onReview: async () => {
        await ctx.reload();
        const chat = document.getElementById('pa-conversation');
        if (chat) {
          chat.scrollIntoView({ block: 'start' });
          chat.focus({ preventScroll: true });
        }
      },
      ...extra,
    });
  }

  // [بوابة 9.2 N6] أزرار الإدارة بصيغة المخاطَب حين نعرف أنه رجل («أبو …» أو صيغة حددتها الإدارة)
  const male = Boolean(prop && prop.identity && prop.identity.form === 'm');
  const CALL_LABEL = male ? 'اتصل به' : 'اتصل بها';

  async function callHer(script) {
    const r = await openCallNote({
      intake: { id: it.id, code: it.code, phone: herPhone, unconfirmed: Boolean(prop && prop.identity && prop.identity.unconfirmed), callIntro: prop && prop.actions && prop.actions.call_intro, form: male ? 'm' : 'f' },
      script: script || null,
    });
    if (r) await reloadAndFocus(ctx, '#pa-proposal');
  }

  function firstMissingVoice() {
    return document.querySelector('#pa-conversation .pa-vt.is-pending textarea') || document.querySelector('.pa-vt.is-pending textarea');
  }

  function goToVoice() {
    const ta = firstMissingVoice();
    if (!ta) {
      // [مراجعة 9.2] لا ملف صوتي يمكن سماعه هنا (تنزيله من واتساب لم يكتمل أو فشل): لا نترك الزر بلا أثر
      toast(story && story.media_failed ? 'تعذّر تنزيل الرسالة الصوتية — اطلبوا منها إعادة إرسالها، أو اتصلوا بها.' : 'الرسالة الصوتية لم تصل بعد إلى المنصة — حاولوا بعد دقائق، أو اتصلوا بها.', 'warning', 8000);
      return;
    }
    ta.closest('.pa-vt').scrollIntoView({ block: 'center', behavior: 'smooth' });
    ta.focus({ preventScroll: true });
  }

  async function summarizeNow() {
    await api.post(`${base}/story/ready`, {});
    toast('حُدِّث الملخص', 'success');
    await reloadAndFocus(ctx, '#pa-proposal');
  }

  function manualDecision() {
    const opt = (cls, iconName, title, text, onClick) =>
      h('button.pa-decide-opt', { type: 'button', class: cls, onClick }, h('span.pa-decide-icon', icon(iconName, { size: 20 })), h('span.pa-decide-text', h('strong', title), h('span', text)));
    return h(
      'details.pa-details.pa-manual',
      { id: 'pa-manual' },
      h('summary', 'قرار يدوي'),
      h(
        'div.pa-decide',
        opt('is-primary', 'briefcase', 'تحويل إلى ملف قانوني', 'يحتاج دراسة محامٍ: يصدر له كود ملف مستقل ويُسند إلى فريق.', () => sheet({ track: 'consultation' })),
        opt('', 'checkCircle', 'تعامل داخلي دون محامٍ', 'استفسار بسيط ترد عليه الإدارة مباشرة دون إسناده لمحامٍ.', openHandle),
        opt('is-muted', 'x', 'أرشفة', 'رسالة غير جدية أو مكررة أو خارج نطاق الخدمة. يمكن إعادة فتحها لاحقًا.', openArchive),
      ),
    );
  }

  function warningsList(list) {
    if (!list || !list.length) return null;
    return h(
      'ul.pa-prop-warnings',
      { 'aria-label': 'تنبيهات' },
      list.map((w) => h('li', { class: `is-${w.code}` }, icon(w.code === 'local' ? 'info' : 'alert', { size: 15 }), h('span', w.text))),
    );
  }

  function callbackCard() {
    const att = (prop && prop.call_attempts) || { count: 0, days: 0, can_close_unreachable: false, items: [] };
    return card({
      title: 'طلبت مكالمة',
      subtitle: 'لم تحكِ مشكلتها بعد — اسمعها في المكالمة',
      icon: 'phone',
      className: 'pa-prop-card pa-callback-card',
      body: h(
        'div.stack-sm',
        h(
          'p.pa-callback-how',
          'اتصل على ',
          herPhone ? h('a', { href: `tel:${herPhone}` }, ltr(localPhone(herPhone))) : 'رقمها', // [بوابة 9.2 K9]
          webForm && webForm.callback_label ? ` (${webForm.callback_label})` : '',
          ' واسمع مشكلتها، ثم سجّل ما قالته هنا ليُلخَّص الطلب.',
        ),
        warningsList((prop && prop.warnings ? prop.warnings : []).filter((w) => w.code !== 'callback_only' && w.code !== 'local')),
        h(
          'div.pa-prop-actions',
          asyncButton('سجّل المكالمة', () => callHer(null), { variant: 'primary', icon: 'phone', className: 'pa-prop-primary' }),
          asyncButton(
            'لم ترد',
            async () => {
              const a = await openCallAttempt({ intakeId: it.id, code: it.code });
              if (a) await reloadAndFocus(ctx, '#pa-proposal');
            },
            { icon: 'phone-off', className: 'pa-prop-noanswer' },
          ),
          att.can_close_unreachable &&
            asyncButton(
              'إغلاق: تعذّر الوصول إليها',
              async () => {
                const r = await closeUnreachable({ intakeId: it.id, attempts: att });
                if (r) await reloadAndFocus(ctx, '#pa-decision');
              },
              { variant: 'danger', icon: 'x' },
            ),
        ),
        att.count > 0 && h('p.small.pa-attempts-count', attemptsCountText(att.count)),
        attemptsList(att.items || []),
        !att.can_close_unreachable && h('p.field-hint', 'يُغلق الطلب بعد 3 محاولات في يومين مختلفين على الأقل.'),
        manualDecision(),
      ),
    });
  }

  function proposalCard() {
    const view = (story && story.view) || 'ready';
    if (view === 'callback') return callbackCard();
    const rec = prop.track && prop.track.recommended;
    const reason = prop.track && prop.track.reason;
    const conf = prop.track && prop.track.confidence;
    const unconf = Boolean(prop.identity && prop.identity.unconfirmed);
    const callFirst = Boolean(prop.actions && prop.actions.primary === 'call');
    const voiceMissing = prop.voice ? Number(prop.voice.missing) || 0 : 0;
    const att = prop.call_attempts || { count: 0, items: [], can_close_unreachable: false };

    const actions = [];
    if (view === 'awaiting') {
      // سُئلت بالفعل: لا «اعمله طلب» بنفس المسار؛ يُعاد التلخيص تلقائيًا عندما ترد، ويبقى اختيار مسار آخر متاحًا
    } else if (view === 'blocked' && voiceMissing > 0) {
      actions.push(button('اسمع الرسالة الصوتية', { variant: 'primary', icon: 'mic', className: 'pa-prop-primary', onClick: goToVoice }));
      if (callFirst) actions.push(asyncButton(CALL_LABEL, () => callHer(prop.actions.call_script), { icon: 'phone' }));
    } else if (callFirst) {
      actions.push(asyncButton(CALL_LABEL, () => callHer(prop.actions.call_script), { variant: 'primary', icon: 'phone', className: 'pa-prop-primary' }));
      if (unconf) actions.push(asyncButton(male ? 'إرسال لصفحته فقط' : 'إرسال لصفحتها فقط', () => sheet({ track: rec || undefined, channel: 'website' }), { icon: 'globe' }));
      else if (rec) actions.push(asyncButton(label('story_track_action', rec), () => sheet({ track: rec }), { icon: 'send' }));
    } else if (!prop.analyzed_at) {
      actions.push(
        asyncButton(
          'حلّل الآن',
          async () => {
            await api.post(`${base}/analyze`);
            toast('اكتمل تحليل الذكاء الاصطناعي', 'success');
            await reloadAndFocus(ctx, '#pa-proposal');
          },
          { variant: 'primary', icon: 'sparkle', className: 'pa-prop-primary' },
        ),
      );
    } else {
      actions.push(asyncButton(rec ? `اعمله طلب: ${label('story_track', rec)}` : 'اعمله طلب', () => sheet({ track: rec || undefined }), { variant: 'primary', icon: 'check', className: 'pa-prop-primary' }));
    }
    actions.push(asyncButton('اختيار مسار آخر', () => sheet({ focusTracks: true }), { variant: view === 'awaiting' ? 'secondary' : 'ghost', icon: 'list' }));
    if (view === 'stale' || view === 'collecting') actions.push(asyncButton('حدّث الملخص الآن', summarizeNow, { variant: 'ghost', icon: 'refresh' }));

    const trackBlock = rec
      ? h(
          'div.pa-prop-track',
          h('p', h('span.pa-prop-label', 'المقترح: '), h('strong', label('story_track_long', rec)), ' ', badge(label('story_track', rec), 'neutral', { icon: 'sparkle' })), // review (r2 P12): اقتراح الذكاء الاصطناعي حبة محايدة — الذهبي والأخضر لنوع الخدمة وحده
          reason && h('p.pa-prop-why', h('strong', 'ليه؟ '), reason),
          conf != null &&
            conf > 0 &&
            progressBar(Math.round(conf * 100), 100, conf >= 0.7 ? 'success' : conf >= 0.5 ? 'warning' : 'danger', { label: `درجة الثقة ${percent(conf)}` }),
        )
      : h('p.pa-prop-why.is-empty', reason || 'لم يقترح الذكاء الاصطناعي مسارًا بعد — اختر المسار بنفسك.');

    return card({
      title: 'تحويل القصة إلى طلب',
      subtitle: 'اقتراح الذكاء الاصطناعي — القرار لك',
      icon: 'sparkle',
      className: 'pa-prop-card',
      body: h(
        'div.stack-sm',
        storyRibbon(view),
        prop.one_line &&
          h(
            'p.pa-story-line.pa-prop-oneline',
            h('span.pa-ai-mark', icon('sparkle', { size: 14 }), h('span.pa-ai-tag', 'اقتراح')),
            prop.preview && badge('ملخص مبدئي', 'muted'),
            h('span.pa-story-line-text', { dir: 'auto' }, prop.one_line),
          ),
        trackBlock,
        view === 'awaiting' && h('p.pa-prop-why', icon('clock', { size: 14 }), ' ', 'سألناها وننتظر ردها؛ عندما ترد يُعاد التلخيص تلقائيًا.'),
        warningsList(prop.warnings),
        h('div.pa-prop-actions', actions),
        att.count > 0 && h('div.pa-prop-attempts', h('p.small', attemptsCountText(att.count)), attemptsList(att.items || [])),
        manualDecision(),
      ),
    });
  }

  function webFormCard() {
    if (!webForm || !(webForm.lines && webForm.lines.length) && !webForm.about) return null;
    const about = webForm.about;
    const aboutBits = about ? [about.governorate && `المحافظة ${about.governorate}`, about.relation_label && `الصفة ${about.relation_label}`].filter(Boolean) : [];
    return card({
      title: webForm.title || 'اختيارات ضغطت عليها في الموقع (قد تكون غير دقيقة)',
      icon: 'globe',
      className: 'pa-form-card',
      body: h(
        'div.stack-sm',
        webForm.lines && webForm.lines.length ? h('ul.pa-form-lines', webForm.lines.map((x) => h('li', x))) : null,
        // [بوابة 9.2 N7] ضغطة على صورة وليست كلامها (R2-B4): لا «قالت إن…»
        webForm.urgent_hint && badge('اختارت صورة التهديد بالطرد — تأكدوا منها', 'danger', { icon: 'alert' }),
        aboutBits.length ? h('p.small.muted', `أضافت بعد الإرسال: ${aboutBits.join('، ')}`) : null,
        h('p.field-hint', 'ضغطات على صور وقد تكون غير دقيقة؛ كلامها في المحادثة هو المعتمد.'),
      ),
    });
  }

  // نص كل رسالة صوتية: بعد الحفظ تُحدَّث الصفحة (الملخص المحلي يُعاد خلال لحظات)
  async function onVoiceSaved(res) {
    const left = res && res.story ? Number(res.story.voice_missing) || 0 : 0;
    const docId = res && res.document_id;
    if (left > 0) toast(voiceLeftText(left), 'success');
    else if (localAi || !isOpen) toast(isOpen ? 'كل الرسائل الصوتية مكتوبة — حُدِّث الملخص' : 'حُفظ النص', 'success');
    else {
      const t = toast(
        h(
          'span.pa-toast-row',
          h('span', 'كل الرسائل الصوتية مكتوبة — سيُحدَّث الملخص خلال دقيقة'),
          button('حدّث الآن', {
            variant: 'link',
            size: 'sm',
            onClick: async () => {
              t.close();
              try {
                await summarizeNow();
              } catch (err) {
                toast(errorMessage(err), 'danger');
              }
            },
          }),
        ),
        'success',
        10000,
      );
    }
    setTimeout(() => reloadAndFocus(ctx, docId ? `#pa-conversation .pa-vt[data-doc="${docId}"] .pa-vt-edit-btn` : '#pa-proposal'), localAi && isOpen ? 900 : 150);
  }

  function voiceEditorFor(doc, audioEl) {
    const note = voiceByDoc.get(doc.id);
    if (!note) return null;
    return voiceTranscriptEditor(note, { audio: audioEl || null, onSaved: onVoiceSaved });
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
        { name: 'due_at', label: `الموعد المستهدف للرد على ${N.def}`, type: 'date', endOfDay: true, min: cairoToday() },
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
          hint: `هذا ما يمكن إتاحته للمحامين لاحقًا — لا تكتب هنا رقم الهاتف أو بيانات التواصل أو مصدر ${N.def}.`,
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
        { name: 'name', label: `اسم ${N.def}`, maxLength: 150 },
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
              h('span.pa-issue-meta', areaBadge, badge('اقتراح الذكاء الاصطناعي', 'neutral', { icon: 'sparkle' })), // review (r2 P12)
            );
          }
          return h(
            'li.pa-issue',
            h('span.pa-issue-title', icon('check', { size: 16 }), x.title),
            h(
              'span.pa-issue-meta',
              areaBadge,
              badge('أضافتها الإدارة', 'neutral'), // review (r2 P12)
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

    // review (v11 segment-staff): طلب «غير محدد» يُختار نوعه هنا — إلزامي بلا اختيار افتراضي (بدل 409 بلا مخرج داخل النافذة)؛
    // واختيار «أفراد وشركات» يخفي التمويل (ملف مدفوع لا يُربط ببرنامج)
    let programSet = null;
    const segPick = segValue
      ? null
      : segmentChoice({
          required: true,
          hint: seg.hint || null,
          onChange: (v) => {
            if (programSet) programSet.hidden = v === 'paid';
          },
        });
    programSet = isPaid ? null : h('fieldset.pa-fieldset', h('legend', 'التمويل'), program.el);

    let created = null;
    modal({
      title: 'تحويل الطلب إلى ملف قانوني',
      size: 'lg',
      body: frag(
        h(
          'p.modal-intro',
          richText('سيصدر للملف كود مستقل حسب المجال مثل INH-2026-00482، وتنتقل إليه المحادثة والمستندات. بعدها تختار الإدارة فريق المحامين وتحدد ما يراه كل منهم.'),
        ),
        segPick && h('div.pa-convert-seg', segPick),
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
          h('legend', `بيانات ${N.def}`),
          h('p.field-hint', `تُحدَّث في ملف ${N.def} `, cl ? codeTag(cl.code) : null, '، ولا تظهر للمحامين إلا إذا أتاحت الإدارة الاسم صراحة.'),
          clientForm.el,
        ),
        // v11 segment-staff: ملف الأفراد والشركات لا يُربط ببرنامج تمويل
        programSet,
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
            const okSeg = !segPick || Boolean(segPick.getValue());
            if (!okSeg) segPick.setError(REQUIRED_TEXT);
            if (!okMain || !okClient || !okSeg) return false;
            const segChosen = segPick ? segPick.getValue() : null;
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
              program_id: (!isPaid && segChosen !== 'paid' && program.get()) || undefined,
              segment: segChosen || undefined, // v11 segment-staff (review): نوع الخدمة لطلب «غير محدد»
            };
            try {
              const res = await api.post(`${base}/convert`, payload);
              created = res.case;
            } catch (err) {
              if (segPick && err && err.code === 'segment_required') segPick.setError(REQUIRED_TEXT);
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
      inLabel: it.contact_name || (cl && cl.name) || N.def,
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
            h('span', `يذكر رقم طلب ل${N.bare} آخر: `, codeTag(ic.intake_code)),
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
      // v11 segment-staff (r2 S7): رسالة وصلت على رقم الجانب الآخر وأُلحقت بهذا الطلب
      if (m.direction === 'in' && m.meta && m.meta.line_mismatch) node.after(h('div.pa-msg-flag.is-start', lineMismatchChip(m.meta.line_mismatch)));
      if (m.meta && m.meta.referral && m.meta.referral.headline) {
        node.after(h('div.pa-msg-flag.is-start.is-info', icon('flag', { size: 14 }), h('span', `وصلت عبر إعلان: «${m.meta.referral.headline}»`)));
      }
      // v9.2 (admin-ai): علامات القصة داخل المحادثة
      const meta = m.meta || {};
      const tags = [];
      const wa = meta.wa || {};
      if (m.direction === 'out' && wa.type === 'list') {
        const rows = (wa.sections || []).flatMap((x) => x.rows || []).map((r) => r.title);
        if (rows.length) tags.push(badge(`القائمة: ${rows.join(' · ')}`, 'muted', { icon: 'list', className: 'pa-msg-list' }));
      }
      if (m.direction === 'in') {
        if (meta.topic_prefill) tags.push(badge('اختارت الموضوع من الموقع', 'info', { icon: 'globe' }));
        else if (meta.topic) tags.push(badge('اختارت من القائمة', 'info', { icon: 'list' }));
        if (meta.story_done) tags.push(badge('أنهت حكايتها', 'success', { icon: 'check' }));
        if (meta.call_note) tags.push(badge('مكالمة — كتبتها الإدارة', 'info', { icon: 'phone' }));
      }
      const bubble = node.querySelector('.msg-bubble');
      if (tags.length && bubble) bubble.append(h('div.pa-msg-tags', tags));
      // نص كل رسالة صوتية منها تحت فقاعتها
      if (m.direction === 'in') {
        const audios = [...node.querySelectorAll('audio')];
        const audioDocs = (m.documents || []).filter((x) => voiceByDoc.has(x.id));
        audioDocs.forEach((doc, k) => {
          const ed = voiceEditorFor(doc, audios[k]);
          if (ed) node.after(h('div.pa-msg-voice', ed));
        });
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
            ic.client_code ? [` الخاص ${N.bi} `, codeTag(ic.client_code)] : null,
            '. لم يدمج النظام الملفين تلقائيًا حماية للخصوصية — تحقق من هوية المرسل أولًا.',
          ),
          h(
            'span.row',
            ic.intake_id && button('فتح الطلب المذكور', { size: 'sm', icon: 'externalLink', href: `#/inbox/${ic.intake_id}` }),
            cl && ic.client_code && button('دمج بعد التحقق', { size: 'sm', icon: 'link', onClick: () => mergeFlow(ic.client_code) }),
          ),
        ),
        'warning',
        { title: `يذكر رقم طلب ل${N.bare} آخر` },
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
          const isAudio = String(doc.mime || '').startsWith('audio/');
          // v9.1 b-forms: الرسالة الصوتية تُسمع هنا مباشرة (metadata: مدتها ظاهرة قبل التشغيل)
          const player = isAudio && h('audio.doc-audio-player', { controls: true, preload: 'metadata', src: downloadUrl(doc.id), 'aria-label': `رسالة صوتية: ${name}` });
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
              player,
              docAiBadge(analyses, doc.id),
              // v9.2: نص الرسالة الصوتية (تكتبه الإدارة) تحت المشغل نفسه
              isAudio && voiceEditorFor(doc, player),
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
        h('span', `تستمر المراسلات مع ${N.def} داخل الملف القانوني `, d.case ? h('a', { href: `#/cases/${d.case.id}` }, codeTag(d.case.code)) : null, '.'),
      );
    }
    const ta = h('textarea.input', { rows: 3, maxlength: 4000, placeholder: `اكتب ردك على ${N.def}…` });
    // v9.1 b-site (B91-01): أين يصل الرد؟ «واتساب + صفحة المتابعة» أو «صفحة المتابعة فقط — الرقم غير مؤكد»
    const replyChannel = it.identity && it.identity.reply_channel ? `يصل الرد: ${it.identity.reply_channel.text}. ` : '';
    const wrap = field(`الرد على ${N.def}`, ta, { hint: `${replyChannel}يُرسل من قناة المؤسسة الرسمية ويُسجل في المحادثة. Ctrl + Enter للإرسال.` });
    // (v9) ردود جاهزة واقتراح رد. الهوية غير المؤكدة: الاسم كما كتبه المرسل فقط، دون ربط بملف العميل المسجل
    const tools = composerTools(ta, {
      context: {
        client_name: (unverified ? it.contact_name : (cl && cl.name) || it.contact_name) || undefined,
        request_code: it.code,
        intake_id: it.id,
        client_id: !unverified && it.client_id ? it.client_id : undefined,
      },
      ai: { intakeId: it.id, sendInfo }, // v11 segment-staff (r2 P13): رأس الإرسال في نافذة الردود المقترحة
    });
    // v11 segment-staff (r2 S8): وصلت على رقم غير مضبوط ← لا واتساب من هنا، صفحة المتابعة فقط
    const channels = unknownLine ? REPLY_CHANNELS.filter((o) => o.value === 'website') : REPLY_CHANNELS;
    const chan = h('select.input', { 'aria-label': 'قناة الإرسال' }, channels.map((o) => h('option', { value: o.value }, o.label)));
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
      // v11 segment-staff (r2 P13): النوع والنبرة و«سيُرسل من» قبل أي إرسال
      sendHeader(sendInfo),
      unknownLine && h('p.pa-note.is-warning', icon('alert', { size: 15 }), h('span', `${unknownLineText(seg.wa_pid_last4)} — الإرسال لصفحة المتابعة فقط.`)),
      unverified &&
        h(
          'p.pa-note.is-warning',
          icon('alert', { size: 15 }),
          h('span', `الهوية غير مؤكدة: الرد عبر واتساب يصل إلى صاحب الرقم المسجل، والرد عبر الموقع يصل إلى من أرسل النموذج — فلا تذكر تفاصيل من ملفات ${N.def} الأخرى.`),
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
            { title: it.status === 'awaiting_client' ? `الطلب بانتظار ${N.def} بالفعل` : null },
            awaitCb,
            h('span', `بانتظار رد ${N.def}`),
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
        { name: 'source', label: `مصدر ${N.def}`, type: 'select', required: true, placeholder: false, options: options('source') },
        { name: 'campaign', label: 'الحملة / جهة الإحالة', maxLength: 150 },
        { name: 'summary', label: 'ملخص الطلب', type: 'textarea', rows: 3, maxLength: 5000 },
        { name: 'internal_notes', label: 'ملاحظات داخلية', type: 'textarea', rows: 3, maxLength: 10000, hint: `لا تظهر ${N.li} ولا للمحامين` },
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
      subtitle: `تصنيف الطلب وأولويته ومصدره — بيانات داخلية لا يراها ${N.def}`,
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
    // v11 gate fix (J-15): طلب عرض من شركة لا يُعرض له تحليل قانوني (المجال والمسار المقترحان لا معنى لهما)
    if (requester) {
      return card({
        title: 'تحليل الذكاء الاصطناعي',
        icon: 'sparkle',
        className: 'pa-ai-card',
        body: h('p.small.muted', 'طلب عرض تجاري من شركة — لا يُعرض له تحليل قانوني. بيانات الشركة واحتياجاتها في بطاقة «طلب عرض — تواصل تجاري».'),
      });
    }
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
        badge(provider, 'neutral', { icon: 'sparkle', title: ai.model || '' }), // review (r2 P12): لا ذهبي لغير «خيري»
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
            h('div.row', badge(areaLabel(out.legal_area), 'neutral'), out.urgency && statusBadge('priority', out.urgency, { dot: false, title: 'الأولوية المقترحة' })),
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
      title: mergeLabel(N.bare),
      intro: `استخدم الدمج عندما يكون صاحب هذا الطلب هو نفسه ${N.acc} مسجلًا برقم أو بريد آخر. ابحث عن الملف الأساسي واختره.`,
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
      toast(`تم الدمج — أصبح الطلب مرتبطًا ${N.bi} ${target.code}`, 'success');
      await reloadAndFocus(ctx, '#pa-client');
    });
  }

  function clientCard() {
    if (!cl) {
      return card({ title: N.def, icon: 'user', body: emptyState(`لا يوجد ${N.bare} مرتبط بهذا الطلب`, null, { compact: true, icon: 'user' }) });
    }
    const idents = cl.identities || [];
    const allChannels = [...new Set([...idents.flatMap((x) => x.channels || []), ...(it.channels || [])])];
    const others = cl.other_intakes || [];
    const cases = cl.cases || [];
    return card({
      title: N.def,
      icon: 'user',
      actions: button(`ملف ${N.def}`, { variant: 'ghost', size: 'sm', icon: 'externalLink', href: `#/clients/${cl.id}` }),
      body: h(
        'div.stack',
        kv([
          [`كود ${N.def}`, h('a.pa-plain-link', { href: `#/clients/${cl.id}` }, codeTag(cl.code))],
          ['الاسم', cl.name || it.contact_name],
          ['الهاتف', cl.phone ? h('span.row', ltr(localPhone(cl.phone)), copyButton(localPhone(cl.phone), '')) : null],
          cl.email && ['البريد', ltr(cl.email)],
          ['المحافظة', cl.governorate || it.governorate],
        ]),
        unverified
          ? h(
              'p.pa-note.is-warning',
              icon('alert', { size: 15 }),
              h('span', `رُبط الطلب بهذا ${N.def} لتطابق رقم الهاتف فقط، والهوية غير مؤكدة: لا تعتمد على تاريخ ${N.def} أدناه في الرد قبل التحقق.`),
            )
          : allChannels.length
          ? h(
              'p.pa-note.is-info',
              icon('link', { size: 15 }),
              h(
                'span',
                allChannels.length > 1
                  ? `ربط النظام تلقائيًا ما وصل من ${allChannels.map((c) => label('channel', c)).join(' و')} بنفس ${N.def} `
                  : `يتعرّف النظام على هذا ${N.def} من رقمه، وأي رسالة منه عبر أي قناة تصل إلى نفس ${N.def} `,
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
          h('h3.pa-mini-h', `تاريخ ${N.def} مع المؤسسة`),
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
            : h('p.small.muted', `هذا أول تواصل لهذا ${N.def} مع المؤسسة.`),
        ),
        N.bare === 'مستفيد/ة' ? button(MERGE_LABEL, { size: 'sm', icon: 'users', onClick: () => mergeFlow() }) : button(mergeLabel(N.bare), { size: 'sm', icon: 'users', onClick: () => mergeFlow() }),
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
        sourceDetailValue(k, v) ?? h('span.pa-break', { dir: 'auto' }, typeof v === 'object' ? JSON.stringify(v) : String(v)),
      ]);
    const chans = it.channels && it.channels.length ? it.channels : [it.first_channel];
    return card({
      title: 'المصدر والقناة',
      icon: 'flag',
      body: h(
        'div.stack-sm',
        h('p.pa-note', icon('info', { size: 15 }), h('span', `المصدر هو ما جاء ${N.bi}، والقناة هي طريقة التواصل: إعلان على فيسبوك قد يصل عبر واتساب.`)),
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
  const VIEW_TONES = { callback: 'info', collecting: 'info', blocked: 'warning', stale: 'warning', ready: 'success', awaiting: 'neutral' };

  // v9.2: ‎?focus=voice‎ (أول رسالة صوتية لم تُكتب) · ‎?focus=call‎ (تسجيل المكالمة) · ‎?focus=chat‎ (المحادثة) — مرة واحدة
  const focusKind = ctx.query && ['voice', 'call', 'chat'].includes(ctx.query.focus) ? ctx.query.focus : null;
  if (focusKind) {
    replaceQuery(`/inbox/${it.id}`, {});
    setTimeout(() => {
      if (focusKind === 'voice') goToVoice();
      else if (focusKind === 'call' && isOpen) callHer(prop && prop.actions ? prop.actions.call_script : null).catch((err) => toast(errorMessage(err), 'danger'));
      else {
        const chat = document.getElementById('pa-conversation');
        if (chat) {
          chat.scrollIntoView({ block: 'start' });
          chat.focus({ preventScroll: true });
        }
      }
    }, 80);
  }
  // عنوان واحد ثابت لكل الحالات («الطلب REQ-…» كعنوان المتصفح)، والموضوع تحته: لا يتبدل العنوان بين اسم المرسل
  // وموضوع الطلب بحسب حالته
  const header = pageHeader({
    title: `الطلب ${it.code}`,
    breadcrumbs: [
      { label: 'صندوق الوارد', href: '#/inbox' },
      { label: it.code },
    ],
    subtitle: it.title
      ? h('span', it.contact_name ? `${it.title} — ${it.contact_name}` : it.title)
      : it.contact_name || (aiTitle && !requester)
        ? h(
            'span',
            it.contact_name ? `من ${it.contact_name}` : null,
            aiTitle && !requester ? h('span.pa-ai-inline', icon('sparkle', { size: 14 }), `${it.contact_name ? ' · ' : ''}عنوان مقترح: ${aiTitle}`) : null,
          )
        : null,
    // v11 gate fix (V6/J-12، V11-48): ترويسة أقصر — الكود هو العنوان فلا يتكرر، والنوع والمجال في «بيانات الفرز»، والأولوية حين تكون عالية فقط
    meta: [
      segHead(),
      statusBadge('intake_status', it.status),
      ['high', 'urgent'].includes(it.priority) && statusBadge('priority', it.priority, { dot: false, icon: 'flag' }),
      // v9.2: الموضوع الذي اختارته (قائمة واتساب أو الموقع) وحالة القصة
      story && story.topic_label && badge(`الموضوع: ${story.topic_label}`, 'neutral', { icon: 'list' }),
      isOpen && story && story.view && story.view !== 'decided' && badge(label('story_view', story.view), VIEW_TONES[story.view] || 'neutral', { className: 'pa-view-badge' }),
      h('span.small.muted', { title: dateTime(it.created_at) }, `وصل ${relative(it.created_at)}`),
    ],
    // (V6) لا صف «رجوع» مستقل: مسار التنقل أعلى الصفحة يعود إلى صندوق الوارد
    actions: it.status === 'converted' && d.case ? [button(`فتح الملف ${d.case.code}`, { variant: 'primary', icon: 'briefcase', href: `#/cases/${d.case.id}` })] : null,
  });

  return h(
    'div.pa-page.pa-page-intake',
    header,
    h(
      'div.detail-layout',
      h(
        'div.detail-main',
        // v11 segment-staff (ST-2): «غير محدد» أولًا — ضغطة واحدة تحفظ النوع بلا سبب (r2 S21)
        !segValue && seg.can_change !== false ? undeterminedCard({ id: it.id, hint: seg.hint || null }, () => reloadAndFocus(ctx, '.seg-head .seg-change')) : null,
        identityEl && withId(identityEl, 'pa-identity'),
        // v9.2: الطلب المفتوح يبدأ بـ «تحويل القصة إلى طلب» (أو «طلبت مكالمة»)، والقرار اليدوي داخلها
        // v11 gate fix (J-15): طلب العرض من شركة يبدأ ببطاقة التواصل التجاري، والقرار اليدوي بدل اقتراح المسار القانوني
        requester ? withId(requesterCard(), 'pa-requester') : null,
        prop && !requester ? withId(proposalCard(), 'pa-proposal') : withId(decisionCard(), 'pa-decision'),
        webFormCard(),
        withId(conversationCard(), 'pa-conversation'),
        allDocs.length ? withId(documentsCard(), 'pa-documents') : null,
        analyses && docAiResultsCard(analyses, allDocs),
        withId(triageCard(), 'pa-triage'),
        // بيانات الأسرة (الاستحقاق) للخيري فقط
        it.client_id && !isPaid && withId(beneficiaryCard({ clientId: it.client_id, intakeId: it.id, onChange: () => ctx.reload() }), 'v9p-beneficiary'),
        activityCard(),
      ),
      h('div.detail-side', withId(aiCard(), 'pa-ai'), withId(clientCard(), 'pa-client'), sourceCard()),
    ),
  );
}
