// v10 b2b-staff (STF-6، U10-S15/S16) — «إعداد التسليم» وضوابط الإرسال.
// النموذج يُحفظ مسودةً على الخادم، وبعد كل تعديل (600 مللي ثانية) يُعاد الفحص المسبق من الخادم نفسه الذي يحكم الإرسال
// (companyDocGate، L-56): الرأي المعتمد، المراجعة النهائية، أسماء المحامين في النص، أسماء الكاتبين في خصائص الملفات،
// ومراجعة ملفات Word/Excel/PDF (D4). «تعبئة من الرأي المعتمد» حتمية بلا ذكاء اصطناعي (L-58)؛ «اقتراح من الرأي المعتمد»
// مسودة للمراجعة فقط. «إرسال للشركة» معطّل حتى تمر كل البوابات، والمعاينة بمكوّن البوابة نفسه (coDeliverableCard).

import { h, mount } from '../../lib/h.js';
import { api, filesToUploads, downloadUrl } from '../../lib/api.js';
import { label } from '../../lib/fmt.js';
import { modal, form, button, icon, alertBox, toast, errorMessage, discardGuard, fileInput, setBusy } from '../../lib/ui.js';
import { DELIVERABLE_KINDS, typeByKey } from '../../lib/company-catalog.js';
import { coDeliverableCard } from '../../lib/company-ui.js';

const DEBOUNCE_MS = 600;
const FIELD_NAMES = { title: 'العنوان', summary: 'الخلاصة', recommendations: 'التوصيات', body: 'النص' };
/** نص مراجعة ملفات Office/PDF (D4، P0) — كما في المواصفة حرفيًا */
export const OFFICE_REVIEW_COPY = 'ملفات Word وExcel وPDF قد تحمل اسم كاتبها في خصائصها وفي التعديلات المتعقَّبة والتعليقات؛ راجعتُ الملفات وتأكدت من خلوّها من أسماء المحامين.';
export const authorLine = (filename, name) => `الملف ${filename} يحمل اسم ${name} في بياناته — احفظه من جديد بلا اسم الكاتب ثم ارفعه`;

const fieldLabel = (f) => (String(f).startsWith('document:') ? 'اسم ملف' : FIELD_NAMES[f] || f);

/**
 * @param {object} o
 * @param {object} o.detail صفحة الطلب للفريق
 * @param {object} [o.deliverable] مسودة قائمة للمتابعة
 * @param {(res:object)=>void} [o.onDone]
 */
export async function openDeliverableSheet({ detail, user = {}, deliverable = null, onDone } = {}) {
  let d = detail;
  const r = d.request;
  const isAdmin = user.role === 'admin';
  const approvedOpinions = ((d.case && d.case.opinions) || []).filter((o) => o.status === 'approved');
  let draft = deliverable && deliverable.status === 'draft' ? deliverable : null;
  let pc = null; // نتيجة الفحص المسبق من الخادم
  // الافتراضي: آخر رأي معتمد للمحامي الرئيسي (لا رأي المراجع)، وإلا آخر رأي معتمد
  let opinionId = draft?.opinion_id || [...approvedOpinions].reverse().find((o) => o.role === 'lead')?.id || approvedOpinions[approvedOpinions.length - 1]?.id || null;
  let docsReviewed = !!draft?.docs_reviewed;
  let override = { on: false, reason: '', names: false };
  let released = null;
  let saving = null;
  let dirtySinceSave = false;
  let handle = null;

  const lang = (r.fields && r.fields.output_language) || 'ar';
  const v0 = {
    kind: draft?.kind || typeByKey(r.type)?.deliverable_kind || 'memo',
    title: draft?.title || r.title,
    summary: draft?.summary || '',
    recommendations: (draft?.recommendations || []).join('\n'),
    risk_level: draft?.risk_level || r.risk_level || '',
    body: draft?.body || '',
    final: draft ? !!draft.final : true,
    message: '',
  };
  const selected = new Set((draft?.documents || []).map((x) => x.id));

  const alertHost = h('div.cs-alert', { 'aria-live': 'assertive' });
  const aiNote = h('p.cs-ai-note', { hidden: true }, icon('sparkle', { size: 14 }), 'مسودة مقترحة — راجِعها قبل الإرسال');
  const f = form(
    [
      { name: 'kind', label: 'نوع التسليم', type: 'select', required: true, placeholder: false, options: DELIVERABLE_KINDS.map((k) => ({ value: k.key, label: k.label })) },
      { name: 'risk_level', label: 'درجة المخاطر', type: 'select', options: ['low', 'medium', 'high'].map((k) => ({ value: k, label: label('company_risk_level', k) })) },
      { name: 'title', label: 'العنوان', type: 'text', required: true, maxLength: 200, full: true },
      { name: 'summary', label: 'الخلاصة التنفيذية', type: 'textarea', required: true, minLength: 10, maxLength: 600, rows: 4, full: true, dir: 'auto' },
      { name: 'recommendations', label: 'التوصيات', type: 'textarea', rows: 4, full: true, dir: 'auto', hint: 'توصية في كل سطر (حتى 8).' },
      { name: 'body', label: 'النص الكامل', type: 'textarea', maxLength: 30000, rows: 8, full: true, dir: 'auto' },
      { name: 'final', type: 'checkbox', label: 'تسليم نهائي', full: true, onChange: () => drawFinalHint() },
      { name: 'message', label: 'رسالة مع التسليم (اختياري)', type: 'textarea', maxLength: 2000, rows: 2, full: true, dir: 'auto' },
    ],
    { values: v0, footer: false },
  );
  const finalHint = h('p.cs-note');
  function drawFinalHint() {
    finalHint.textContent = f.getValues().final ? 'ينقل الطلب إلى «تم التسليم» ويطلب من الشركة الاعتماد أو التعديل.' : 'تسليم مرحلي: لا يغيّر حالة الطلب.';
  }
  f.control('final')?.wrap?.append(finalHint);

  // ── تعبئة من الرأي المعتمد (حتمية) واقتراح الذكاء الاصطناعي ──
  const opinionSel = approvedOpinions.length > 1
    ? h(
        'div.select-wrap',
        h(
          'select.input',
          { 'aria-label': 'الرأي المعتمد', onChange: (e) => (opinionId = Number(e.target.value)) },
          approvedOpinions.map((o) => h('option', { value: String(o.id), selected: o.id === opinionId }, `${label('assignment_role', o.role)} — الإصدار ${o.version}`)),
        ),
      )
    : null;
  function recsText(list) {
    return (Array.isArray(list) ? list : []).filter(Boolean).slice(0, 8).join('\n');
  }
  async function prefill(btn) {
    if (!opinionId) return;
    setBusy(btn, true);
    try {
      const p = await api.post(`/admin/company-requests/${r.id}/deliverables/prefill`, { opinion_id: opinionId });
      f.setValues({ summary: String(p.summary || '').slice(0, 600), recommendations: recsText(p.recommendations), risk_level: p.risk_level || f.getValues().risk_level, body: p.body || '' });
      opinionId = p.opinion_id || opinionId;
      aiNote.hidden = true;
      changed();
      toast('عُبّئ التسليم من الرأي المعتمد — راجِعه قبل الإرسال.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'danger');
    } finally {
      setBusy(btn, false);
    }
  }
  async function aiSuggest(btn) {
    if (!opinionId) return;
    setBusy(btn, true);
    try {
      const s = await api.post(`/admin/company-requests/${r.id}/ai/deliverable`, { opinion_id: opinionId, lang });
      f.setValues({ summary: String(s.summary || '').slice(0, 600), recommendations: recsText(s.recommendations), risk_level: s.risk_level || f.getValues().risk_level, body: s.body || f.getValues().body });
      aiNote.hidden = false;
      changed();
    } catch (err) {
      toast(errorMessage(err), 'danger');
    } finally {
      setBusy(btn, false);
    }
  }
  async function insertOpinion(btn) {
    if (!opinionId) return;
    setBusy(btn, true);
    try {
      const p = await api.post(`/admin/company-requests/${r.id}/deliverables/prefill`, { opinion_id: opinionId });
      f.setValues({ body: p.body || '' });
      changed();
    } catch (err) {
      toast(errorMessage(err), 'danger');
    } finally {
      setBusy(btn, false);
    }
  }
  const fillBar = approvedOpinions.length
    ? h(
        'div.cs-fill',
        opinionSel,
        button('تعبئة من الرأي المعتمد', { variant: 'primary', size: 'sm', icon: 'fileText', className: 'cs-prefill', onClick: (e) => prefill(e.currentTarget) }),
        button('اقتراح من الرأي المعتمد', { variant: 'secondary', size: 'sm', icon: 'sparkle', onClick: (e) => aiSuggest(e.currentTarget) }),
        button('إدراج نص الرأي المعتمد', { variant: 'ghost', size: 'sm', icon: 'plus', onClick: (e) => insertOpinion(e.currentTarget) }),
      )
    : h('p.cs-note', icon('info', { size: 14 }), 'لا يوجد رأي معتمد في ملف العمل بعد؛ اعتمد رأي المحامي من ملف العمل ليُعبأ التسليم منه.');

  // ── الملفات ──
  const docs = (d.documents || []).filter((x) => x.mime === undefined || !/^audio\//.test(x.mime || ''));
  const filesHost = h('div.cs-files');
  const upload = fileInput({ maxFiles: 10, label: 'رفع ملف جديد', onChange: () => changed() });
  function drawFiles() {
    const lawyerFiles = docs.filter((x) => x.uploaded_by_kind === 'lawyer');
    const others = docs.filter((x) => x.uploaded_by_kind !== 'lawyer');
    const row = (x) =>
      h(
        'label.check',
        h('input', {
          type: 'checkbox',
          checked: selected.has(x.id),
          onChange: (e) => {
            if (e.target.checked) selected.add(x.id);
            else selected.delete(x.id);
            changed();
          },
        }),
        h('span', { dir: 'auto' }, x.title || x.filename, x.title && x.filename && x.title !== x.filename ? h('span.muted', ` (${x.filename})`) : null),
      );
    mount(
      filesHost,
      lawyerFiles.length ? h('div', h('p.cs-sub', 'ملفات عمل المحامين'), h('div.cs-checklist', lawyerFiles.map(row))) : null,
      others.length ? h('div', h('p.cs-sub', 'من الطلب وملف العمل'), h('div.cs-checklist', others.map(row))) : null,
      upload.el,
    );
  }

  // ── جاهزية الإرسال ──
  const checkHost = h('div.cs-checks', { 'aria-live': 'polite' });
  const previewHost = h('div.cs-preview-card');
  function gateRows() {
    const out = [];
    const ok = (text) => ({ ok: true, text });
    const bad = (text, extra) => ({ ok: false, text, extra });
    if (!pc) {
      // قبل أول حفظ: مرآة مبدئية في المتصفح (الحكم للخادم بعد الحفظ، D12)
      const v = f.getValues();
      const text = [v.title, v.summary, v.recommendations, v.body].join('\n');
      const team = ((d.case && d.case.team) || []).map((a) => a.lawyer_name).filter(Boolean);
      const named = team.filter((n) => text.includes(n));
      const needsSenior = !!r.requires_senior_review;
      const seniorOk = ((d.case && d.case.opinions) || []).some((o) => o.role === 'reviewer' && o.status === 'approved');
      return [
        approvedOpinions.length ? ok('رأي معتمد في ملف العمل') : bad('لا يوجد رأي معتمد بعد'),
        ...(needsSenior ? [seniorOk ? ok('مراجعة نهائية معتمدة') : bad('المراجعة النهائية لم تُعتمد بعد')] : []),
        named.length ? bad(`يظهر اسم «${named[0]}» في النص`) : ok('لا أسماء محامين في النص'),
        { ok: null, text: 'يكتمل الفحص (ومنه خصائص الملفات) بعد حفظ المسودة.' },
      ];
    }
    out.push(pc.approved_opinion ? ok('رأي معتمد في ملف العمل') : bad('لا يوجد رأي معتمد بعد', 'opinion'));
    if (pc.senior_review !== 'not_required') out.push(pc.senior_review === 'ok' ? ok('مراجعة نهائية معتمدة') : bad('المراجعة النهائية لم تُعتمد بعد', 'senior'));
    if (!pc.lawyer_names.length) out.push(ok('لا أسماء محامين في النص'));
    else for (const n of pc.lawyer_names) out.push(bad(`يظهر اسم «${n.name}» في ${fieldLabel(n.field)}`, 'names'));
    for (const fa of pc.file_authors || []) {
      const fn = fa.filename || (pc.office_docs || []).find((o) => o.id === fa.document_id)?.filename || 'المرفق';
      out.push(bad(authorLine(fn, (fa.names || [])[0] || ''), 'author'));
    }
    if ((pc.office_docs || []).length) out.push(docsReviewed ? ok('روجعت خصائص ملفات Word/Excel/PDF') : bad('راجِع خصائص ملفات Word/Excel/PDF', 'office'));
    out.push(!(pc.foreign_docs || []).length ? ok('كل الملفات من هذا الطلب') : bad('بعض الملفات لا تخص هذا الطلب', 'foreign'));
    return out;
  }
  /** هل تمر كل البوابات (مع تجاوز مدير النظام المسموح به)؟ */
  function gatesPass() {
    if (!pc || !draft) return false;
    if (dirtySinceSave || saving) return false;
    const needsOverride = !pc.approved_opinion || pc.senior_review === 'missing' || pc.lawyer_names.length > 0;
    if ((pc.file_authors || []).length || (pc.foreign_docs || []).length) return false;
    if ((pc.office_docs || []).length && !docsReviewed) return false;
    if (needsOverride) {
      if (!isAdmin || !override.on || override.reason.trim().length < 3) return false;
      if (pc.lawyer_names.length && !override.names) return false;
    }
    return true;
  }
  const reviewCb = h('input', {
    type: 'checkbox',
    onChange: () => {
      docsReviewed = reviewCb.checked;
      changed({ immediate: true });
    },
  });
  const overrideCb = h('input', { type: 'checkbox', onChange: () => ((override.on = overrideCb.checked), drawChecks()) });
  const namesCb = h('input', { type: 'checkbox', onChange: () => ((override.names = namesCb.checked), drawChecks()) });
  const overrideReason = h('textarea.input', { rows: 2, maxlength: 500, 'aria-label': 'سبب الإرسال رغم ذلك', onInput: () => ((override.reason = overrideReason.value), syncSend()) });
  function drawChecks() {
    const rows = gateRows();
    const needsOverride = pc && (!pc.approved_opinion || pc.senior_review === 'missing' || pc.lawyer_names.length > 0);
    reviewCb.checked = docsReviewed;
    mount(
      checkHost,
      h('h3.cs-section-title', 'جاهزية الإرسال'),
      h(
        'ul.cs-gates',
        rows.map((x) => h('li', { class: x.ok === true ? 'is-ok' : x.ok === false ? 'is-bad' : 'is-wait' }, icon(x.ok === true ? 'checkCircle' : x.ok === false ? 'alert' : 'clock', { size: 16 }), h('span', x.text))),
      ),
      pc && (pc.office_docs || []).length ? h('label.check.cs-office', reviewCb, h('span', OFFICE_REVIEW_COPY)) : null,
      needsOverride && isAdmin
        ? h(
            'div.cs-override',
            h('label.check', overrideCb, h('span', 'إرسال رغم ذلك (يُسجَّل في سجل الأمان)')),
            override.on && pc.lawyer_names.length ? h('label.check', namesCb, h('span', 'السماح بالأسماء')) : null,
            override.on ? h('div.field', h('span.field-label', 'السبب', h('span.req', { 'aria-hidden': 'true' }, '*')), overrideReason) : null,
          )
        : null,
      saving ? h('p.cs-note', 'جارٍ الحفظ والفحص…') : draft ? h('p.cs-note', `مسودة محفوظة — الإصدار ${draft.version}`) : null,
    );
    syncSend();
  }
  function drawPreview() {
    const v = f.getValues();
    const docsShown = docs.filter((x) => selected.has(x.id));
    mount(
      previewHost,
      coDeliverableCard(
        {
          id: draft?.id || 0,
          version: draft?.version || 1,
          kind: v.kind,
          kind_label: DELIVERABLE_KINDS.find((k) => k.key === v.kind)?.label,
          title: v.title,
          summary: v.summary,
          body: v.body || null,
          recommendations: String(v.recommendations || '').split('\n').map((x) => x.trim()).filter(Boolean),
          risk_level: v.risk_level || null,
          risk_level_label: v.risk_level ? label('company_risk_level', v.risk_level) : null,
          final: !!v.final,
          status: 'released',
          documents: docsShown.map((x) => ({ id: x.id, title: x.title, filename: x.filename, mime: x.mime, size: x.size, kind: x.kind })),
        },
        { docUrl: (doc, { inline = false } = {}) => `${downloadUrl(doc.id)}${inline ? '?inline=1' : ''}` },
      ),
    );
  }

  // ── الحفظ والفحص ──
  function bodyOf() {
    const v = f.getValues();
    return {
      kind: v.kind,
      title: v.title,
      summary: v.summary,
      body: v.body || '',
      recommendations: String(v.recommendations || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 8),
      risk_level: v.risk_level || null,
      final: !!v.final,
      opinion_id: opinionId || null,
      docs_reviewed: docsReviewed,
      document_ids: [...selected],
    };
  }
  function canSave() {
    const v = f.getValues();
    return String(v.title || '').trim().length > 0 && String(v.summary || '').trim().length >= 10 && String(v.summary || '').length <= 600;
  }
  async function save() {
    if (!canSave()) return false;
    const body = bodyOf();
    const files = upload.getFiles();
    if (files.length) body.files = await filesToUploads(files);
    dirtySinceSave = false;
    try {
      const res = draft
        ? await api.patch(`/admin/company-deliverables/${draft.id}`, body)
        : await api.post(`/admin/company-requests/${r.id}/deliverables`, body);
      draft = res.deliverable;
      pc = res.precheck;
      if (files.length) {
        upload.clear?.();
        if (!upload.clear) upload.setFiles([]);
        for (const x of draft.documents || []) {
          if (!docs.some((y) => y.id === x.id)) docs.push(x);
          selected.add(x.id);
        }
        drawFiles();
      }
      mount(alertHost);
      return true;
    } catch (err) {
      dirtySinceSave = true;
      mount(alertHost, alertBox(errorMessage(err), 'danger'));
      if (err && err.details && err.details.fields) f.showError(err);
      return false;
    }
  }
  let timer = null;
  function changed({ immediate = false } = {}) {
    dirtySinceSave = true;
    drawPreview();
    clearTimeout(timer);
    const run = async () => {
      if (saving) {
        timer = setTimeout(run, DEBOUNCE_MS);
        return;
      }
      saving = save();
      drawChecks();
      await saving;
      saving = null;
      drawChecks();
    };
    if (immediate) run();
    else timer = setTimeout(run, DEBOUNCE_MS);
    drawChecks();
  }
  f.el.addEventListener('input', () => changed());
  f.el.addEventListener('change', () => changed());

  async function release() {
    mount(alertHost);
    if (!f.validate()) return false;
    clearTimeout(timer);
    if (saving) await saving;
    if (dirtySinceSave || !draft) {
      saving = save();
      const ok = await saving;
      saving = null;
      if (!ok) return false;
    }
    drawChecks();
    if (!gatesPass()) {
      mount(alertHost, alertBox('لا يُرسل التسليم قبل أن تمر كل ضوابط «جاهزية الإرسال».', 'danger'));
      return false;
    }
    const body = { docs_reviewed: docsReviewed, message: f.getValues().message || undefined };
    if (override.on) {
      body.override_reason = override.reason.trim();
      if (override.names) body.allow_names = true;
    }
    try {
      released = await api.post(`/admin/company-deliverables/${draft.id}/release`, body);
      return true;
    } catch (err) {
      if (err && err.details && typeof err.details === 'object' && 'approved_opinion' in err.details) {
        pc = err.details;
        drawChecks();
      }
      mount(alertHost, alertBox(errorMessage(err), 'danger'));
      return false;
    }
  }

  async function saveDraftNow() {
    clearTimeout(timer);
    if (!f.validate()) return false;
    saving = save();
    const ok = await saving;
    saving = null;
    drawChecks();
    if (ok) toast('حُفظت مسودة التسليم.', 'success');
    return false; // تبقى الورقة مفتوحة
  }

  function showPreview() {
    drawPreview();
    previewHost.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const isDirty = () => dirtySinceSave && (f.getValues().summary || '').trim() !== '';
  handle = modal({
    sheet: true,
    className: 'cs-sheet cs-sheet-xl cs-deliverable',
    title: draft ? `تسليم — الإصدار ${draft.version}` : 'إعداد تسليم',
    subtitle: `${r.code} — ${d.company.name}`,
    beforeClose: discardGuard(isDirty, { singular: true }),
    body: h(
      'div.cs-body.cs-two',
      h('div.cs-col', alertHost, fillBar, aiNote, f.el, h('div.field', h('span.field-label', 'الملفات'), filesHost)),
      h('aside.cs-col.cs-aside', checkHost, h('h3.cs-section-title', 'كما ستراه الشركة'), previewHost),
    ),
    actions: [
      { label: 'إلغاء', variant: 'ghost' },
      { label: 'معاينة كما ستراه الشركة', variant: 'ghost', icon: 'eye', onClick: () => (showPreview(), false) },
      { label: 'حفظ مسودة', variant: 'secondary', icon: 'check', onClick: saveDraftNow },
      { label: 'إرسال للشركة', variant: 'primary', icon: 'send', onClick: async () => ((await release()) ? undefined : false) },
    ],
    onClose: () => {
      clearTimeout(timer);
      if (released) {
        toast(`أُرسل التسليم إلى ${d.company.name}.`, 'success');
        if (onDone) onDone(released);
      } else if (draft && onDone) onDone(null);
    },
  });
  const sendBtn = handle.buttons[3];
  sendBtn.classList.add('cs-send');
  function syncSend() {
    const pass = gatesPass();
    sendBtn.disabled = !pass;
    sendBtn.title = pass ? '' : 'يُتاح الإرسال بعد أن تمر كل ضوابط «جاهزية الإرسال»';
  }
  // modal() يعيد تفعيل الأزرار بعد كل إجراء: نعيد ضبط «إرسال للشركة» بعدها
  for (const b of handle.buttons) b.addEventListener('click', () => setTimeout(syncSend, 0));

  drawFinalHint();
  drawFiles();
  drawPreview();
  if (draft) {
    try {
      pc = await api.get(`/admin/company-deliverables/${draft.id}/precheck`);
      docsReviewed = !!pc.docs_reviewed;
    } catch {
      pc = null;
    }
  }
  drawChecks();
  return handle;
}
