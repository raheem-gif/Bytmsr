// الإعدادات والمستخدمون (لمدير النظام): إعدادات المؤسسة، حالة التكاملات (واتساب والذكاء الاصطناعي)، وحسابات الإدارة.

import { h, frag } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { getMeta, toLatinDigits } from '../../../lib/fmt.js';
import { pageHeader, card, form, kv, badge, button, toast } from '../../../lib/ui.js';
import { usersAdminSection } from '../../components/account-admin.js';
import { siteSettingsCard } from '../../components/site-settings.js';
import { brandSettingsCard } from '../../components/brand-settings.js'; // v9.2 ألوان المؤسسة
import { storySettingsCard } from '../../components/story-settings.js'; // v9.2 القصص الواردة على واتساب (admin-ai)
import { b2bSettingsCard, companyPlansCard } from '../../components/company-b2b-settings.js'; // v10 b2b-staff (STF-9، U10-S22/S23)

/**
 * v9.2: ‎#/settings?section=<id>‎ يمرّر الصفحة إلى البطاقة التي تحمل هذا المعرّف ويضع التركيز على عنوانها
 * (‎section=brand‎ لألوان المؤسسة، ‎section=stories‎ لإعدادات القصص، وأي بطاقة أخرى بمعرّف).
 */
function focusSection(section) {
  if (typeof section !== 'string' || !/^[a-z][a-z0-9-]{0,40}$/.test(section)) return;
  let tries = 0;
  const go = () => {
    const el = document.getElementById(section);
    if (!el || !el.isConnected) {
      tries += 1;
      if (tries < 60) setTimeout(go, 50);
      return;
    }
    const heading = el.querySelector('h2, h3') || el;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    el.scrollIntoView({ block: 'start' });
    heading.focus({ preventScroll: true });
  };
  setTimeout(go, 0);
}

/** حالة واتساب: «متصل» فقط بعد اختبار اتصال ناجح لبيانات الاعتماد الحالية (يحسبها الخادم في whatsapp_status) */
function waStatusBadge(integ) {
  const st = (integ.whatsapp_status && integ.whatsapp_status.state) || (integ.whatsapp_configured ? 'untested' : 'simulation');
  if (st === 'connected') return badge('متصل — تُرسل الرسائل فعليًا', 'success', { icon: 'whatsapp' });
  if (st === 'failed') return badge('مضبوط — فشل آخر اختبار للاتصال', 'danger', { icon: 'whatsapp' });
  if (st === 'untested') return badge('مضبوط — لم يُختبر الاتصال بعد', 'warning', { icon: 'whatsapp' });
  return badge(integ.demo ? 'غير مربوط — وضع المحاكاة' : 'غير مربوط', 'warning', { icon: 'whatsapp' });
}

/**
 * ملخص التكاملات في ثلاثة صفوف (واتساب / الذكاء الاصطناعي / Webhook) — للقراءة فقط.
 * @param {object} integ integrations من GET /api/admin/settings
 */
export function integrationSummary(integ = {}) {
  const aiOn = integ.ai && integ.ai.provider === 'anthropic';
  const webhookReady = integ.whatsapp_verify_token_set && integ.whatsapp_app_secret_set;
  const missing = [!integ.whatsapp_verify_token_set && 'رمز التحقق', !integ.whatsapp_app_secret_set && 'سر التطبيق'].filter(Boolean);
  return kv([
    [
      'واتساب للأعمال',
      waStatusBadge(integ),
    ],
    [
      'الذكاء الاصطناعي',
      aiOn ? badge('Claude متصل', 'success', { icon: 'sparkle' }) : badge('المحلل المحلي (دون اتصال خارجي)', 'info', { icon: 'sparkle' }),
    ],
    [
      'Webhook (الرسائل الواردة)',
      webhookReady
        ? badge('جاهز — يُتحقق من توقيع كل رسالة واردة', 'success', { icon: 'shieldCheck' })
        : badge(`ينقصه: ${missing.join(' و')}`, 'warning', { icon: 'alert' }),
    ],
  ]);
}

function fieldError(name, msg) {
  const e = new Error(msg);
  e.details = { fields: { [name]: msg } };
  return e;
}

export default async function render(ctx) {
  const me = ctx.user || {};
  const data = await api.get('/admin/settings');
  const settings = data.settings || {};
  const integ = data.integrations || {};
  // الرقم التوضيحي القديم (+20 100 000 0000) يُعرض فارغًا: ليس رقم المؤسسة ولا يقبله الخادم
  const isPlaceholderNumber = (s) => /^\+?20\s*100\s*000\s*0000$/.test(String(s || '').trim());
  const shownNumber = isPlaceholderNumber(settings.whatsapp_display_number) ? '' : String(settings.whatsapp_display_number || '').trim();
  // شارة «غير مضبوط» بجوار شرح الحقل حين يكون فارغًا، فلا يُظن المثال قيمةً محفوظة
  const waUnsetBadge = badge('غير مضبوط', 'warning', { icon: 'alert' });
  waUnsetBadge.hidden = Boolean(shownNumber);
  waUnsetBadge.classList.add('st-unset-badge');

  // ───────────── إعدادات المؤسسة ─────────────
  const orgForm = form(
    [
      { name: 'org_name', label: 'اسم المؤسسة', required: true, maxLength: 100 },
      { name: 'org_tagline', label: 'الشعار التعريفي', maxLength: 200 },
      {
        name: 'privacy_notice',
        label: 'نص الخصوصية الظاهر للمستفيدين',
        type: 'textarea',
        rows: 3,
        required: true,
        maxLength: 2000,
        counter: true,
        hint: 'يظهر في نموذج الطلب على الموقع وفي صفحة المتابعة',
      },
      {
        name: 'whatsapp_display_number',
        label: 'رقم واتساب الظاهر للمستفيدين',
        ltr: true,
        maxLength: 30,
        // مثال محايد لا يشبه قيمة محفوظة (الرقم الفعلي يظهر قيمةً في الحقل إن ضُبط). لاتيني فقط: الحقل باتجاه LTR
        placeholder: '2012xxxxxxxx',
        hint: [
          waUnsetBadge,
          'بصيغة دولية مثل 2012xxxxxxxx. يُستخدم في أزرار وروابط واتساب على الموقع وصفحة متابعة المستفيد/ة، والأولوية لرقم صفحة «التكاملات» إن ضُبط. اتركه فارغًا إن لم يكن للمؤسسة رقم واتساب بعد، فيظهر الهاتف بديلًا.',
        ],
      },
      {
        name: 'whatsapp_template_name',
        label: 'قالب احتياطي (للتوافق)',
        ltr: true,
        maxLength: 100,
        hint: [
          'يُستخدم فقط لرسائل المتابعة خارج نافذة الـ 24 ساعة إن لم يُربط لها قالب. يُفضَّل ربط القوالب لكل غرض من ',
          h('a', { href: '#/quick-replies?tab=templates' }, 'صفحة قوالب واتساب'),
          '.',
        ],
      },
      { name: 'whatsapp_template_language', label: 'لغة القالب الاحتياطي', ltr: true, maxLength: 10, hint: 'كود اللغة كما في Meta، مثل ar أو en_US' },
      {
        name: 'default_assignment_days',
        label: 'المدة الافتراضية لرد المحامي',
        type: 'number',
        integer: true,
        required: true,
        min: 1,
        max: 60,
        suffix: 'يوم',
        hint: 'تُقترح تلقائيًا كموعد مطلوب عند إسناد الملفات',
      },
      // v9.1 l-court: يظهر للمحامين في «مستحقاتي» بعد «موعد الصرف المعتاد:»
      {
        name: 'lawyer_payout_note',
        label: 'موعد صرف مستحقات المحامين',
        maxLength: 200,
        placeholder: 'مثال: من 5 إلى 10 من الشهر التالي، بتحويل بنكي',
        hint: 'يظهر للمحامين في صفحة «مستحقاتي». اتركه فارغًا لإخفائه، فيظهر لهم «تحدد الإدارة موعد الصرف».',
      },
      // v9.1 b-portal (B91-09): «إزاي أدفع؟» في «مصاريف قضيتك» بصفحة متابعة المستفيد/ة
      {
        name: 'portal_payment_instructions',
        label: 'تعليمات الدفع للمستفيد/ة',
        type: 'textarea',
        rows: 3,
        maxLength: 500,
        counter: true,
        placeholder: 'مثال: الدفع في مقر المؤسسة من السبت للخميس، وخدي إيصال مختوم دايمًا.',
        hint: 'تظهر تحت «إزاي أدفع؟» في صفحة المتابعة. بكلام بسيط، ومن غير أرقام حسابات شخصية. اتركه فارغًا لإخفائه.',
      },
      {
        name: 'similarity_threshold',
        label: 'حد التشابه للحالات المشابهة',
        type: 'number',
        required: true,
        min: 0.05,
        max: 0.9,
        hint: 'بين 0.05 و0.9 — كلما قلّ ظهرت حالات أكثر وأقل دقة. الافتراضي 0.15',
      },
    ],
    {
      values: { ...settings, whatsapp_display_number: shownNumber },
      submitLabel: 'حفظ الإعدادات',
      submitIcon: 'check',
      onSubmit: async (v, f) => {
        const digits = toLatinDigits(v.whatsapp_display_number || '').replace(/\D/g, '');
        if (digits && (digits.length < 8 || digits.length > 15)) throw fieldError('whatsapp_display_number', 'أدخل رقمًا صحيحًا بصيغة دولية مثل +20 12 1111 4662');
        if (digits === '201000000000' || digits === '01000000000') throw fieldError('whatsapp_display_number', 'هذا رقم توضيحي وليس رقم واتساب المؤسسة؛ اكتب الرقم الفعلي أو اترك الحقل فارغًا');
        if (v.whatsapp_template_language && !/^[a-zA-Z_]{2,10}$/.test(v.whatsapp_template_language)) throw fieldError('whatsapp_template_language', 'كود اللغة حروف لاتينية فقط، مثل ar أو en_US');
        const saved = await api.patch('/admin/settings', {
          org_name: v.org_name,
          org_tagline: v.org_tagline || '',
          privacy_notice: v.privacy_notice,
          whatsapp_display_number: v.whatsapp_display_number || '',
          whatsapp_template_name: v.whatsapp_template_name || '',
          whatsapp_template_language: v.whatsapp_template_language || '',
          default_assignment_days: v.default_assignment_days,
          similarity_threshold: v.similarity_threshold,
          lawyer_payout_note: v.lawyer_payout_note || '', // v9.1 l-court
          portal_payment_instructions: v.portal_payment_instructions || '', // v9.1 b-portal
        });
        const meta = getMeta();
        if (meta && meta.settings && saved) {
          for (const k of ['org_name', 'org_tagline', 'privacy_notice', 'whatsapp_display_number']) if (k in saved) meta.settings[k] = saved[k];
        }
        if (saved) {
          f.setValues(saved);
          waUnsetBadge.hidden = Boolean(String(saved.whatsapp_display_number || '').trim()) && !isPlaceholderNumber(saved.whatsapp_display_number);
        }
        toast('تم حفظ إعدادات المؤسسة — يظهر اسم المؤسسة الجديد في القائمة بعد إعادة تحميل الصفحة', 'success', 5000);
      },
    },
  );

  // ───────────── حالة التكاملات (ملخص فقط) ─────────────
  // الضبط نفسه (الأسرار، المصدر: متغيرات البيئة أو لوحة الإدارة، اختبار الاتصال) في صفحة «التكاملات» وحدها،
  // فلا تتكرر هنا خطوات ‎.env‎ ولا جدول المتغيرات حتى لا تتعارض التعليمات بين الصفحتين.
  const integrationsCard = card({
    title: 'حالة التكاملات',
    subtitle: 'ملخص سريع؛ تُضبط بيانات واتساب والذكاء الاصطناعي وتُختبر من صفحة «التكاملات»، وتُطبَّق فور الحفظ.',
    icon: 'link',
    actions: button('إدارة التكاملات', { variant: 'primary', size: 'sm', icon: 'settings', href: '#/integrations' }),
    body: integrationSummary(integ),
  });

  // ───────────── المستخدمون (وحدة accounts: الحسابات، الدعوات المعلقة، سياسة الأمان) ─────────────
  const usersSection = usersAdminSection({ me });

  focusSection(ctx.query && ctx.query.section); // v9.2

  return frag(
    pageHeader({
      title: 'الإعدادات والمستخدمون',
      subtitle: 'إعدادات المؤسسة العامة، وحالة ربط واتساب والذكاء الاصطناعي، وحسابات فريق الإدارة.',
      breadcrumbs: [{ label: 'لوحة المتابعة', href: '#/dashboard' }, { label: 'الإعدادات والمستخدمون' }],
    }),
    card({ title: 'إعدادات المؤسسة', subtitle: 'تظهر للمستفيدين في الموقع وصفحة المتابعة ورسائل واتساب', icon: 'settings', body: orgForm.el }),
    me.role === 'admin' ? brandSettingsCard({ user: me }) : null, // v9.2: بعد «إعدادات المؤسسة»، لمدير النظام وحده
    siteSettingsCard(settings),
    storySettingsCard(settings),
    me.role === 'admin' ? b2bSettingsCard() : null, // v10 b2b-staff: «خدمة الشركات» (section=b2b)
    me.role === 'admin' ? companyPlansCard() : null, // v10 b2b-staff: «باقات الشركات» (section=plans)
    integrationsCard,
    usersSection,
  );
}

