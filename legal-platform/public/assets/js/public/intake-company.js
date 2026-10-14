// v11 gate-public (G11-45، L11-36): «اطلبوا عرضًا لشركتكم» — شاشة واحدة في /intake?seg=paid&mode=company.
// تُحمّل عند الحاجة فقط (import() من intake.js)، فليست في حزمة الصفحة. نصوصها هنا (لا تظهر إلا للشركات)، وأدوات
// الصفحة (الأيقونات، تحقق الرقم، معرّف الإرسال، حقل الفخ، مصدر الزيارة) تأتي من intake.js بلا تكرار.
// الإرسال: نفس POST /api/public/intake بـ segment:'paid' وrequester (G11-44)؛ بلا بطاقة واتساب (الشركات بالبوابة والبريد).
import { h, mount } from '../lib/h.js';

const T = {
  h1: 'اطلبوا عرضًا لشركتكم',
  sub: 'املأوا البيانات، ويتواصل معكم فريقنا خلال يوم عمل لترتيب مكالمة تعريفية وعرض مناسب.',
  back: 'رجوع',
  company: 'اسم الشركة',
  companyErr: 'اكتبوا اسم الشركة.',
  contact: 'اسم المسؤول عن التواصل',
  contactErr: 'اكتبوا اسم المسؤول عن التواصل.',
  job: 'المسمى الوظيفي (اختياري)',
  phone: 'رقم الموبايل',
  email: 'البريد الإلكتروني (اختياري)',
  emailErr: 'البريد الإلكتروني غير صحيح.',
  size: 'عدد الموظفين (اختياري)',
  needs: 'ما الذي يهمكم؟ (اختياري)',
  more: 'تفاصيل إضافية (اختياري)',
  morePh: 'مثال: نحتاج مراجعة عقود الموردين وشؤون الموظفين، ولدينا 40 موظفًا.',
  consent: 'بالضغط على «إرسال الطلب» توافقون على استخدام هذه البيانات للتواصل معكم بخصوص العرض فقط.',
  send: 'إرسال الطلب',
  sending: 'جارٍ الإرسال…',
  done: 'وصلنا طلبكم',
  doneText: 'سيتواصل معكم فريقنا خلال يوم عمل.',
  ref: 'رقم الطلب: ',
  portalQ: 'لديكم حساب في بوابة الشركات؟ ',
  portalGo: 'الدخول',
  page: 'صفحة الطلب',
};
// نفس قيم REQUESTER_EMPLOYEES وREQUESTER_NEEDS (segment.js) بكلمات G11-45
const SIZES = [
  ['1-10', '1–10'],
  ['11-50', '11–50'],
  ['51-200', '51–200'],
  ['200+', 'أكثر من 200'],
];
const NEEDS = [
  ['contracts', 'مراجعة العقود وصياغتها'],
  ['employees', 'شؤون الموظفين'],
  ['compliance', 'الامتثال والتراخيص'],
  ['disputes', 'النزاعات والإنذارات'],
  ['subscription', 'اشتراك شهري متكامل'],
];
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

/** حقل بعنوانه وسطر خطئه (role=alert) */
function row(id, label, input, required = false) {
  const err = h('p.bmf-error', { id: `${id}-err`, role: 'alert', hidden: true });
  input.id = id;
  input.setAttribute('aria-describedby', `${id}-err`);
  if (required) input.setAttribute('aria-required', 'true');
  const el = h('div.lead-row', h('label.lead-label', { htmlFor: id }, label), input, err);
  el.input = input;
  el.set = (msg) => {
    err.textContent = msg || '';
    err.hidden = !msg;
    if (msg) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  };
  return el;
}

/** شرائح اختيار (واحد أو أكثر) */
function chips(items, multi) {
  const picked = new Set();
  const btns = items.map(([v, label]) =>
    h(
      'button.lead-chip',
      {
        type: 'button',
        'aria-pressed': 'false',
        // «1–10» تُقرأ من اليسار (بدونها تنعكس الأرقام في سطر عربي: «10–1»)
        dir: /^[\d–+]+$/.test(label) ? 'ltr' : null,
        onClick: (e) => {
          const on = !picked.has(v);
          if (!multi) picked.clear();
          if (on) picked.add(v);
          else picked.delete(v);
          btns.forEach((b, i) => b.setAttribute('aria-pressed', String(picked.has(items[i][0]))));
          e.currentTarget.focus();
        },
      },
      label,
    ),
  );
  const el = h('div.lead-chips', btns);
  el.values = () => [...picked];
  return el;
}

/**
 * يرسم الشاشة في root. ctx من intake.js: { root, org, X, ic, normalizeEgPhone, newSubmissionId, honeypot, honeypotInput,
 * loadExtras, attribution, brandName }.
 */
export function companyLead(ctx) {
  const { root, X, ic, normalizeEgPhone } = ctx;
  if (X.company?.css && !document.querySelector('link[data-lead-css]')) {
    document.head.append(h('link', { rel: 'stylesheet', href: X.company.css, 'data-lead-css': '' }));
  }
  // v11 fixer-public (J-14): عنوان التبويب يبقى عنوان الخادم G11-05 «طلب عرض لخدمات الشركات — …» (لا يُستبدل بعنوان الشاشة)
  const sid = ctx.newSubmissionId();
  const input = (attrs) => h('input.bmf-input', { type: 'text', ...attrs });
  const company = row('lead-company', T.company, input({ autocomplete: 'organization', maxlength: 120 }), true);
  const contact = row('lead-contact', T.contact, input({ autocomplete: 'name', maxlength: 120 }), true);
  const job = row('lead-job', T.job, input({ autocomplete: 'organization-title', maxlength: 80 }));
  const phone = row('lead-phone', T.phone, input({ type: 'tel', inputmode: 'numeric', autocomplete: 'tel-national', dir: 'ltr', maxlength: 20, placeholder: '01xxxxxxxxx' }), true);
  const email = row('lead-email', T.email, input({ type: 'email', autocomplete: 'email', dir: 'ltr', maxlength: 120 }));
  const size = chips(SIZES, false);
  const needs = chips(NEEDS, true);
  const details = h('textarea.bmf-textarea', { id: 'lead-more', rows: 4, maxlength: 4000, placeholder: T.morePh });
  const status = h('div.lead-status', { role: 'status' });
  const submit = h('button.bmf-btn.bmf-btn-gold.bmf-btn-lg.bmf-btn-block.lead-submit', { type: 'button' }, h('span', T.send));
  const heading = h('h1.bmf-title', { tabindex: '-1', id: 'lead-title' }, T.h1);
  const group = (label, el) => h('fieldset.lead-set', h('legend.lead-label', label), el);

  function check() {
    const bad = [];
    const nm = (r, err) => {
      const val = r.input.value.trim();
      r.set(val.length < 2 ? err : '');
      if (val.length < 2) bad.push(r);
    };
    nm(company, T.companyErr);
    nm(contact, T.contactErr);
    const raw = phone.input.value.trim();
    phone.set(!raw ? X.MSG.phoneEmpty : normalizeEgPhone(raw) ? '' : X.MSG.phoneBad);
    if (phone.input.getAttribute('aria-invalid')) bad.push(phone);
    const em = email.input.value.trim();
    email.set(em && !EMAIL_RE.test(em) ? T.emailErr : '');
    if (em && !EMAIL_RE.test(em)) bad.push(email);
    if (bad.length) bad[0].input.focus();
    return !bad.length;
  }

  let busy = false;
  async function send() {
    if (busy || !check()) return;
    busy = true;
    submit.disabled = true;
    mount(status, h('p.bmf-note', T.sending));
    const chosen = needs.values();
    const text = details.value.trim();
    const em = email.input.value.trim();
    const requester = { kind: 'company', company_name: company.input.value.trim() };
    if (job.input.value.trim()) requester.job_title = job.input.value.trim();
    if (em) requester.email = em;
    if (size.values()[0]) requester.employees = size.values()[0];
    if (chosen.length) requester.needs = chosen;
    const entry = new URLSearchParams(window.location.search).get('entry') === 'company_band' ? 'company_band' : 'direct';
    let res;
    let data = null;
    try {
      await ctx.loadExtras();
      res = await fetch('/api/public/intake', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contact.input.value.trim(),
          phone: normalizeEgPhone(phone.input.value),
          email: em || undefined,
          description: [NEEDS.filter(([v]) => chosen.includes(v)).map(([, l]) => l).join('، '), text].filter(Boolean).join('\n'),
          documents: [],
          attribution: ctx.attribution(),
          entry,
          mode: 'form',
          consent: true,
          consent_v: 1,
          segment: 'paid',
          requester,
          website: ctx.honeypotInput.value,
          submission_id: sid,
        }),
      });
      data = await res.json().catch(() => null);
    } catch {
      res = null;
    }
    busy = false;
    submit.disabled = false;
    if (!res || res.status >= 500) return mount(status, h('p.bmf-error', { role: 'alert' }, X.MSG.net));
    if (!res.ok) {
      const f = data?.details?.fields || {};
      if (f.company_name) company.set(T.companyErr);
      if (f.email) email.set(T.emailErr);
      if (f.name) contact.set(T.contactErr);
      if (data?.code === 'bad_phone') phone.set(X.MSG.phoneBad);
      return mount(status, h('p.bmf-error', { role: 'alert' }, X.ERR[data?.code] || X.ERR.invalid));
    }
    done(data || {});
  }
  submit.addEventListener('click', send);

  function done(r) {
    const title = h('h1#lead-done', { tabindex: '-1' }, T.done);
    let portal = null;
    try {
      const u = new URL(r.portal_url, window.location.origin);
      if (u.origin === window.location.origin && u.pathname.startsWith('/p/')) portal = u.href;
    } catch {
      portal = null;
    }
    mount(
      root,
      h(
        'section.bmf-success.lead-done',
        { 'aria-labelledby': 'lead-done' },
        h('span.bmf-done-icon', ic('check', 36)),
        title,
        h('p.bmf-thanks', T.doneText),
        r.reference && h('p.lead-ref', T.ref, h('span.bmf-ref.bmf-ltr', r.reference)),
        X.company?.portal && h('p.lead-portal', T.portalQ, h('a', { href: '/company' }, T.portalGo)),
        portal && h('a.lead-page', { href: portal }, T.page),
      ),
    );
    window.scrollTo({ top: 0, behavior: 'instant' });
    title.focus({ preventScroll: true });
  }

  mount(
    root,
    h(
      'section.bmf-step.lead',
      { 'aria-labelledby': 'lead-title' },
      h('div.bmf-head', h('div.bmf-qbar', h('a.bmf-btn.bmf-btn-text.bmf-back', { href: '/services#companies' }, ic('arrowRight', 20), h('span', T.back))), heading, h('p.bmf-sub', T.sub)),
      h(
        'div.bmf-body',
        h('div.lead-group', company, contact, job),
        h('div.lead-group', phone, email),
        group(T.size, size),
        group(T.needs, needs),
        h('div.lead-row', h('label.lead-label', { htmlFor: 'lead-more' }, T.more), details),
        h('div.bmf-actions', h('p.bmf-consent-line', T.consent), submit, status),
      ),
    ),
    ctx.honeypot,
  );
}
