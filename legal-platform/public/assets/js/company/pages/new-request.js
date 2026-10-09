// الإصدار 10 — طلب جديد (U10-28…U10-41 مع L-27 وL-53 وL-54 و§8.3): 12 مربعًا ← «التفاصيل» ← «الموعد والخصوصية» ← إرسال
// ← تأكيد. على الهاتف شاشتان قصيرتان بشريط إجراء ثابت و«1 من 2» (زر الرجوع خطوة واحدة: ?step=2)، وعلى الحاسوب صفحة واحدة
// بملخص ثابت جانبي. المستندات تُرفع فور اختيارها (coUploader)، والوعد يُعاد حسابه كل دقيقة بنفس company-sla.js الذي يحسب به
// الخادم من مدخلات /plan (تُجلب عند فتح «الموعد والخصوصية» وقبل كل إرسال). client_ref واحد لكل إرسال (لا يتكرر الطلب).
// المسودة (P0): الخطوة والنوع ونص الحقول ومعرّفات المرفقات المرفوعة فقط، في ek.co.draft:{userId} لمدة 7 أيام.
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { relative, money, cairoToday, getMeta } from '../../lib/fmt.js';
import { icon, button, badge, field, choiceTiles, alertBox, confirmDialog, setBusy, codeTag } from '../../lib/ui.js';
import { haptic } from '../../lib/haptics.js';
import { REQUEST_TYPES, typeByKey, OUTPUT_LANGUAGES, VISIBILITIES } from '../../lib/company-catalog.js';
import { renderTitle, REQUEST_LIMITS, CAP_NOTE, typeFields } from '../../lib/company-catalog-fields.js';
import { calendarsFromJson, promisePreview, dueAt, deliveryHours, durationText, hoursText, dayLength, cairoDayKey } from '../../lib/company-sla.js';
import { coTypeFields, coUploader } from '../../lib/company-forms.js';
import { copy, countOf, whenLong, typeLabel, typeIcon, coUsageMeter, dayText } from '../../lib/company-ui.js';
import { W } from '../words-flows.js';
import { S, seesMoney, readDraft, writeDraft, clearDraft } from '../state.js';
import { pageHead, errorView } from '../common.js';

const N = W.newRequest;
const FROM_FIELD = { renewal_followup: 'memory_id', supplier_issue: 'contract_memory_id', nda: 'template_memory_id' };
const DATE_KEYS = ['signing_deadline', 'response_deadline', 'launch_date', 'expiry_date'];

// ───────────────────────── بيانات مشتركة بين الشاشتين (تبقى أثناء التنقل بين الخطوتين) ─────────────────────────
let cache = { plan: null, planAt: 0, offset: 0 };
let form = null;

function clientRef() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
}
async function loadPlan(force = false) {
  if (!force && cache.plan && Date.now() - cache.planAt < 5 * 60000) return cache.plan;
  const t0 = Date.now();
  const plan = await api.get('/company/plan');
  cache = { plan, planAt: Date.now(), offset: Date.parse(plan.server_now) - Math.round((t0 + Date.now()) / 2) || 0 };
  return plan;
}
/** «الآن» بساعة الخادم (فيتطابق الوعد قبل الإرسال مع ما يسجله الخادم؛ CO-10) */
const serverNow = () => new Date(Date.now() + (cache.offset || 0)).toISOString();
export const termsOf = (plan) => ({ sla: Object.fromEntries((plan?.sla_table || []).map((r) => [r.priority, r])), size_factor: plan?.size_factor || { S: 0.5, M: 1, L: 2 } });
/** الوعد قبل الإرسال لكل درجة من مدخلات /plan وحدها — نفس promise_preview الذي يحسبه الخادم عند server_now (CO-10، §8.5-10) */
export const previewFromPlan = (plan, nowIso) => (plan?.calendar ? promisePreview(nowIso, termsOf(plan), calendarsFromJson(plan.calendar)) : null);

// ───────────────────────── المربعات (U10-28 A) ─────────────────────────
function draftCard(ctx) {
  const d = readDraft();
  if (!d || !typeByKey(d.type)) return null;
  const card = h(
    'div.co-draft',
    { role: 'status' },
    h('p', copy('newRequest.draft', { type: typeLabel(d.type), when: relative(d.saved_at ? new Date(d.saved_at).toISOString() : null) })),
    h(
      'div.co-draft-actions',
      button(N.draft_continue, { variant: 'primary', onClick: () => ctx.navigate(`/requests/new/${d.type}${d.step === 2 ? '?step=2' : ''}`) }),
      button(N.draft_delete, {
        variant: 'ghost',
        onClick: async () => {
          if (!(await confirmDialog({ title: N.draft_delete_confirm, message: N.draft_delete_text, confirmLabel: N.draft_delete, cancelLabel: N.cancel, danger: true }))) return;
          clearDraft();
          form = null;
          card.remove();
        },
      }),
    ),
  );
  return card;
}

async function tiles(ctx) {
  let plan = null;
  try {
    plan = await loadPlan();
  } catch {
    plan = null;
  }
  const scope = plan?.scope_types?.length ? new Set(plan.scope_types) : null;
  const q = ctx.query.from ? `?from=${encodeURIComponent(ctx.query.from)}` : '';
  return h(
    'div.co-page.co-new',
    pageHead(N.pick_title, N.pick_sub),
    draftCard(ctx),
    h(
      'div.co-tiles',
      REQUEST_TYPES.map((t) =>
        h(
          'a.co-type-tile',
          { href: `#/requests/new/${t.key}${q}` },
          typeIcon(t.key, { size: 28 }),
          h('span.co-type-tile-label', t.company_label),
          h('span.co-type-tile-sub', { lang: t.sub_lang || null, dir: t.sub_lang ? 'ltr' : null }, t.sub),
          scope && !scope.has(t.key) ? badge(N.out_of_plan, 'primary', { className: 'co-badge' }) : null,
        ),
      ),
    ),
  );
}

// ───────────────────────── النموذج ─────────────────────────
function newForm(type, draft = null, carry = null) {
  const t = typeByKey(type);
  return {
    type,
    step: draft?.step === 2 ? 2 : 1,
    client_ref: draft?.client_ref || clientRef(),
    title: draft?.title || '',
    titleEdited: !!draft?.titleEdited,
    description: draft?.description ?? carry?.description ?? '',
    fields: draft?.fields || {},
    uploads: draft?.uploads || carry?.uploads || [],
    priority: draft?.priority || 'normal',
    urgent_reason: draft?.urgent_reason || '',
    needed_by: draft?.needed_by || '',
    visibility: draft?.visibility || (t.default_visibility === 'private' ? 'private' : 'company'),
    watcher_ids: draft?.watcher_ids || [],
    output_language: draft?.output_language || 'ar',
    entity_id: draft?.entity_id || '',
    ui: null,
    done: null,
  };
}

function saveDraftSoon() {
  clearTimeout(saveDraftSoon.t);
  saveDraftSoon.t = setTimeout(() => {
    if (!form || form.done) return;
    const f = form;
    // فتح النموذج وحده لا يصنع مسودة: شيء كتبه المستخدم أو أرفقه أو اختاره
    // (أو مسودة لهذا النوع قائمة فتتابع الخطوة)؛ القيم الافتراضية للحقول لا تُعد كتابة
    const fieldsNow = f.ui?.typeFields ? JSON.stringify(f.ui.typeFields.values()) : null;
    const touched =
      !!String(f.description || '').trim() ||
      f.titleEdited ||
      (f.ui?.uploader ? f.ui.uploader.entries().length > 0 : (f.uploads || []).length > 0) ||
      (fieldsNow != null && fieldsNow !== f.fieldsBaseline) ||
      readDraft()?.type === f.type;
    if (!touched) return;
    writeDraft({
      v: 1,
      step: f.step,
      type: f.type,
      client_ref: f.client_ref,
      title: f.titleEdited ? f.title : '',
      titleEdited: f.titleEdited,
      description: f.description,
      fields: f.ui?.typeFields ? f.ui.typeFields.values() : f.fields,
      uploads: f.ui?.uploader ? f.ui.uploader.entries() : f.uploads,
      priority: f.priority,
      urgent_reason: f.urgent_reason,
      needed_by: f.needed_by,
      visibility: f.visibility,
      watcher_ids: f.watcher_ids,
      output_language: f.output_language,
      entity_id: f.entity_id,
    });
  }, 800);
}

/** يبني عناصر الخطوتين مرة واحدة لكل طلب (تبقى كما هي أثناء التنقل بين الخطوتين ورفع الملفات جارٍ) */
function buildUi(ctx, data) {
  const f = form;
  const t = typeByKey(f.type);
  const plan = data.plan;
  const ui = { errors: {} };
  // — الخطوة 1: التفاصيل —
  const desc = h('textarea.input', { rows: 5, dir: 'auto', 'aria-required': 'true', maxlength: REQUEST_LIMITS.description_max, value: f.description });
  const descWrap = field(t.description_label, desc, { required: true, hint: t.description_hint, full: true });
  const left = Math.max(0, REQUEST_LIMITS.files_per_request);
  ui.uploader = coUploader({ max: REQUEST_LIMITS.files_per_call, perRequestLeft: left, initial: f.uploads, onChange: () => { ui.docWrap.setError(''); refreshSummary(); saveDraftSoon(); } });
  const docLabel = t.requires_document ? t.document_label : N.documents;
  ui.docWrap = field(docLabel, ui.uploader.el, { required: t.requires_document, hint: !t.requires_document && t.document_label ? t.document_label : null, full: true, group: true });
  const expired = (f.uploads || []).filter((u) => u.expires_at && Date.parse(u.expires_at) <= Date.now());
  if (expired.length) ui.uploader.setError(copy('uploader.expired', { names: expired.map((u) => u.filename).join('، ') }));
  const titleIn = h('input.input', { type: 'text', dir: 'auto', maxlength: REQUEST_LIMITS.title_max, value: f.title });
  const titleWrap = field(N.title_field, titleIn);
  const memoryTitles = Object.fromEntries((data.memory || []).map((m) => [m.id, m.title]));
  const syncTitle = () => {
    if (f.titleEdited) return;
    const v = renderTitle(f.type, ui.typeFields.values(), { memoryTitles });
    titleIn.value = v;
    f.title = v;
  };
  ui.typeFields = coTypeFields(f.type, f.fields, {
    entities: data.entities,
    counterparties: data.counterparties,
    memoryItems: data.memory,
    contractValueCap: plan?.contract_value_cap ?? null,
    between: [t.requires_document ? ui.docWrap : null, descWrap],
    onChange: () => {
      syncTitle();
      refreshUrgency();
      refreshSummary();
      saveDraftSoon();
    },
  });
  desc.addEventListener('input', () => {
    f.description = desc.value;
    if (descWrap.classList.contains('has-error') && desc.value.trim().length >= REQUEST_LIMITS.description_min) descWrap.setError('');
    refreshLanguageHint();
    saveDraftSoon();
  });
  desc.addEventListener('blur', () => desc.value.trim() && desc.value.trim().length < REQUEST_LIMITS.description_min && descWrap.setError(N.description_short));
  titleIn.addEventListener('input', () => {
    f.title = titleIn.value;
    f.titleEdited = titleIn.value.trim() !== '';
    saveDraftSoon();
  });
  if (!f.titleEdited) syncTitle();
  ui.step1Alert = h('p.co-send-error', { role: 'alert', hidden: true });
  ui.s1 = h(
    'section.co-nr-s1.co-section',
    h('header.co-section-head', h('h2.co-section-title', N.step1), h('p.co-nr-step-count.num.co-phone-only', copy('newRequest.step', { i: 1 }))),
    h('div.co-nr-form', ui.typeFields.el, t.requires_document ? null : ui.docWrap, titleWrap, ui.step1Alert),
  );
  ui.descWrap = descWrap;
  ui.desc = desc;

  // — الخطوة 2: الموعد والخصوصية —
  const cals = plan?.calendar ? calendarsFromJson(plan.calendar) : null;
  const terms = termsOf(plan);
  const q = plan?.quota || null;
  const urgentLeft = q && q.urgent_included != null ? Math.max(0, q.urgent_included - q.urgent_used) : null;
  const hintFor = (p) => {
    const row = terms.sla[p];
    if (!row || !cals) return '';
    if (row.clock === 'calendar') return copy('newRequest.respond_urgent', { duration: hoursText(row.first_response_hours), window: plan.urgent_hours_text || getMeta()?.urgent_hours_text || '' });
    return copy('newRequest.respond_within', { duration: durationText(row.first_response_hours, cals.business) });
  };
  ui.urgency = choiceTiles({
    label: N.urgency,
    value: f.priority,
    columns: 1,
    className: 'co-urgency',
    options: [
      { value: 'normal', label: N.normal, hint: hintFor('normal') },
      { value: 'high', label: N.high, hint: hintFor('high') },
      { value: 'urgent', label: N.urgent, hint: [hintFor('urgent'), urgentLeft != null ? copy('newRequest.urgent_left', { n: urgentLeft, m: q.urgent_included }) : ''].filter(Boolean).join(' · ') },
    ],
    onChange: (v) => {
      f.priority = v || 'normal';
      reasonWrap.hidden = f.priority !== 'urgent';
      urgentNone.hidden = !(f.priority === 'urgent' && urgentLeft === 0);
      refreshUrgency();
      refreshSummary();
      saveDraftSoon();
    },
  });
  const urgentNone = h('p.co-hint-warning', { hidden: !(f.priority === 'urgent' && urgentLeft === 0) }, icon('info', { size: 16 }), h('span', N.urgent_none));
  const suggest = h('p.co-hint-warning', { hidden: true }, icon('alert', { size: 16 }), h('span', N.suggest_urgent), button(N.pick_urgent, { variant: 'link', size: 'sm', onClick: () => { ui.urgency.setValue('urgent'); f.priority = 'urgent'; reasonWrap.hidden = false; urgentNone.hidden = urgentLeft !== 0; refreshUrgency(); refreshSummary(); reason.focus(); } }));
  const reason = h('input.input', { type: 'text', dir: 'auto', 'aria-required': 'true', maxlength: 300, value: f.urgent_reason });
  const reasonWrap = field(N.urgent_reason, reason, { required: true });
  reasonWrap.hidden = f.priority !== 'urgent';
  reason.addEventListener('input', () => {
    f.urgent_reason = reason.value;
    if (reason.value.trim()) reasonWrap.setError('');
    saveDraftSoon();
  });
  const needed = h('input.input', { type: 'date', dir: 'ltr', min: cairoToday(), value: f.needed_by });
  const neededWarn = h('p.co-hint-warning', { hidden: true }, icon('alert', { size: 16 }), h('span', N.needed_by_warning));
  const neededWrap = field(N.needed_by, h('div', needed, neededWarn), { hint: N.needed_by_hint });
  needed.addEventListener('input', () => {
    f.needed_by = needed.value;
    neededWrap.setError(needed.value && needed.value < cairoToday() ? N.past_date : '');
    refreshUrgency();
    saveDraftSoon();
  });
  const ents = (data.entities || []).filter((e) => e.status !== 'inactive');
  let entityWrap = null;
  if (ents.length > 1) {
    const sel = h('select.input', { 'aria-required': 'true', onChange: () => { f.entity_id = sel.value; entityWrap.setError(''); refreshSummary(); saveDraftSoon(); } }, h('option', { value: '' }, '— اختاروا —'), ents.map((e) => h('option', { value: String(e.id) }, e.name)));
    sel.value = String(f.entity_id || '');
    entityWrap = field(N.entity, h('div.select-wrap', sel), { required: true });
  } else f.entity_id = ents[0]?.id || '';
  const visHint = h('p.field-hint', t.default_visibility === 'private' ? `${N.visibility_hint} ${N.private_default}` : N.visibility_hint);
  const vis = choiceTiles({
    label: N.visibility,
    value: f.visibility,
    columns: 1,
    options: VISIBILITIES.map((v) => ({ value: v.key, label: v.label })),
    onChange: (v) => {
      f.visibility = v || 'company';
      privateNote.hidden = f.visibility !== 'private';
      saveDraftSoon();
    },
  });
  const others = (data.colleagues || []).filter((c) => c.id !== S.user?.id);
  const privateNote = h('p.field-hint', { hidden: f.visibility !== 'private' }, N.watchers_private);
  let watchersWrap = null;
  if (others.length) {
    const sel = new Set(f.watcher_ids.map(Number));
    const chips = others.map((c) =>
      h(
        'button.chip-toggle',
        { type: 'button', 'aria-pressed': sel.has(c.id) ? 'true' : 'false', class: sel.has(c.id) && 'is-on', onClick: (e) => { if (sel.has(c.id)) sel.delete(c.id); else if (sel.size < REQUEST_LIMITS.watchers_max) sel.add(c.id); e.currentTarget.setAttribute('aria-pressed', sel.has(c.id) ? 'true' : 'false'); e.currentTarget.classList.toggle('is-on', sel.has(c.id)); f.watcher_ids = [...sel]; saveDraftSoon(); } },
        icon('check', { size: 14 }),
        h('span', c.name),
        h('span.co-watcher-role', `· ${c.role_label}`),
      ),
    );
    watchersWrap = field(N.watchers, h('div.co-watchers', chips), { hint: N.watchers_hint, group: true, full: true });
  }
  const langHint = h('p.field-hint', { hidden: true }, N.language_hint);
  const lang = choiceTiles({
    label: N.language,
    value: f.output_language,
    variant: 'chip',
    options: OUTPUT_LANGUAGES.map((o) => ({ value: o.key, label: o.label })),
    onChange: (v) => {
      f.output_language = v || 'ar';
      saveDraftSoon();
    },
  });
  ui.step2Alert = h('p.co-send-error', { role: 'alert', hidden: true });
  ui.s2 = h(
    'section.co-nr-s2.co-section',
    h('header.co-section-head', h('h2.co-section-title', N.step2), h('p.co-nr-step-count.num.co-phone-only', copy('newRequest.step', { i: 2 }))),
    h('div.co-nr-form', ui.urgency, urgentNone, suggest, reasonWrap, neededWrap, entityWrap, h('div', vis, visHint, privateNote), watchersWrap, h('div', lang, langHint), ui.step2Alert),
  );

  // — الملخص والإرسال —
  const lineType = h('p.co-summary-strong');
  const linePromise = h('p');
  const lineTypical = h('p.co-summary-muted');
  const lineScope = h('p');
  const meterBox = h('div');
  ui.sendError = h('p.co-send-error', { role: 'alert', hidden: true });
  ui.send = button(N.send, { variant: 'primary', block: true, size: 'lg', onClick: () => send(ctx) });
  ui.summary = h('section.co-summary', { 'aria-live': 'polite' }, h('h2.co-summary-title', N.summary), lineType, linePromise, lineTypical, lineScope, meterBox);
  ui.aside = h('aside.co-nr-aside', ui.summary, h('div.co-nr-bar.co-nr-send', ui.sendError, ui.send));

  function refreshUrgency() {
    const vals = ui.typeFields.values();
    const dates = [...DATE_KEYS.map((k) => vals[k]), f.needed_by].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')));
    let near = false;
    if (cals && dates.length) {
      const oneDay = cairoDayKey(dueAt(serverNow(), dayLength(cals.business), 'business', cals));
      near = dates.some((d) => d <= oneDay);
    }
    suggest.hidden = !near || f.priority === 'urgent';
    let warn = false;
    if (cals && f.needed_by) {
      const s = terms.sla[f.priority] || terms.sla.normal;
      const hrs = deliveryHours(terms, f.priority, t.default_size || 'M');
      if (s && hrs) {
        const expected = dueAt(serverNow(), Number(s.first_response_hours) + hrs, s.clock, cals);
        warn = !!expected && cairoDayKey(expected) > f.needed_by;
      }
    }
    neededWarn.hidden = !warn || f.priority === 'urgent';
  }
  function refreshLanguageHint() {
    const text = `${desc.value} ${ui.uploader.entries().map((u) => u.filename).join(' ')}`;
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    const arabic = (text.match(/[؀-ۿ]/g) || []).length;
    langHint.hidden = !(latin > 20 && latin > arabic * 2) || f.output_language !== 'ar';
  }
  /** الوعد والنتيجة على الباقة قبل الإرسال (L-54): بنفس حساب الخادم */
  function refreshSummary() {
    const ent = ents.length > 1 ? ents.find((e) => String(e.id) === String(f.entity_id))?.name : null;
    const docs = ui.uploader.uploadIds().length;
    lineType.textContent = [t.company_label, ent, docs ? countOf(docs, 'document') : null].filter(Boolean).join(' · ');
    const p = plan ? previewFromPlan(plan, serverNow())?.[f.priority] : null;
    linePromise.textContent = p?.first_response_by ? copy('promise.first_response', { when: whenLong(p.first_response_by) }) : '';
    const s = terms.sla[f.priority];
    const hrs = s ? deliveryHours(terms, f.priority, t.default_size || 'M') : null;
    lineTypical.textContent = hrs && cals ? (s.clock === 'calendar' ? copy('newRequest.typical_urgent', { hours: hoursText(hrs) }) : copy('promise.typical', { duration: durationText(hrs, cals.business) })) : '';
    // النتيجة على الباقة
    const vals = ui.typeFields.values();
    const outScope = (plan?.scope_types?.length && !plan.scope_types.includes(f.type)) || (vals.stage && ['lawsuit_filed', 'arbitration'].includes(vals.stage) && (plan?.excluded_work || []).some((x) => x === (vals.stage === 'arbitration' ? 'arbitration' : 'litigation')));
    const overCap = plan?.contract_value_cap && Number(String(vals.contract_value || '').replace(/[,\s]/g, '')) > plan.contract_value_cap;
    let scopeText = '';
    let meter = null;
    if (outScope) scopeText = N.out_scope;
    else if (q) {
      const atLimit = !q.unlimited && q.included != null && q.used >= q.included;
      const price = q.overage_price != null ? money(q.overage_price) : '';
      const money_ = seesMoney() && price;
      if (q.unlimited || q.included == null) scopeText = N.in_plan_unlimited;
      else if (!atLimit) {
        scopeText = N.in_plan;
        meter = coUsageMeter(q, { showPrices: seesMoney(), newRequest: true, hasManager: !!S.home?.account_manager });
      } else if (q.policy === 'bill') scopeText = money_ ? copy('newRequest.over_bill', { price }) : N.over_bill_member;
      else if (q.policy === 'block') scopeText = S.home?.account_manager ? N.over_block : N.over_block_team;
      else scopeText = money_ ? copy('newRequest.over_approve', { price }) : N.over_approve_member;
      if (overCap) scopeText = `${scopeText} ${CAP_NOTE}`.trim();
    }
    lineScope.textContent = scopeText;
    mount(meterBox, meter);
    f.outScope = !!outScope;
  }
  refreshUrgency();
  refreshLanguageHint();
  refreshSummary();
  ui.refreshSummary = refreshSummary;
  ui.refreshUrgency = refreshUrgency;
  ui.reason = reason;
  ui.reasonWrap = reasonWrap;
  ui.entityWrap = entityWrap;
  ui.neededWrap = neededWrap;
  ui.titleWrap = titleWrap;
  // كل دقيقة: الوعد بساعة الخادم (لا يتجمد على الشاشة المفتوحة)
  ui.timer = setInterval(() => {
    if (!ui.summary.isConnected) return clearInterval(ui.timer);
    refreshSummary();
  }, 60000);
  f.fieldsBaseline = JSON.stringify(ui.typeFields.values());
  return ui;
}

// ───────────────────────── التحقق والإرسال ─────────────────────────
function validateStep1() {
  const f = form;
  const t = typeByKey(f.type);
  const ui = f.ui;
  const res = ui.typeFields.validate();
  let n = Object.keys(res.errors).length;
  let first = res.first?.wrap || null;
  if (f.description.trim().length < REQUEST_LIMITS.description_min) {
    ui.descWrap.setError(f.description.trim() ? N.description_short : N.required);
    n += 1;
    first = first || ui.descWrap;
  }
  if (ui.uploader.pending()) {
    ui.docWrap.setError(W.uploader.wait);
    n += 1;
    first = first || ui.docWrap;
  } else if (ui.uploader.failed()) {
    ui.docWrap.setError(W.uploader.has_failed);
    n += 1;
    first = first || ui.docWrap;
  } else if (t.requires_document && !ui.uploader.uploadIds().length) {
    ui.docWrap.setError(copy('newRequest.doc_missing', { label: t.document_label }));
    n += 1;
    first = first || ui.docWrap;
  }
  ui.step1Alert.hidden = !n;
  ui.step1Alert.textContent = n ? copy('newRequest.review', { n: countOf(n, 'field') }) : '';
  if (first) {
    first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    first.querySelector('input:not([type=hidden]), select, textarea, button, label')?.focus({ preventScroll: true });
  }
  return !n;
}
function validateStep2() {
  const f = form;
  const ui = f.ui;
  let n = 0;
  let first = null;
  if (f.priority === 'urgent' && !f.urgent_reason.trim()) {
    ui.reasonWrap.setError(N.urgent_reason_required);
    n += 1;
    first = ui.reasonWrap;
  }
  if (f.needed_by && f.needed_by < cairoToday()) {
    ui.neededWrap.setError(N.past_date);
    n += 1;
    first = first || ui.neededWrap;
  }
  if (ui.entityWrap && !f.entity_id) {
    ui.entityWrap.setError(N.entity_required);
    n += 1;
    first = first || ui.entityWrap;
  }
  ui.step2Alert.hidden = !n;
  ui.step2Alert.textContent = n ? copy('newRequest.review', { n: countOf(n, 'field') }) : '';
  if (first) {
    first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    first.querySelector('input, select, textarea, button')?.focus({ preventScroll: true });
  }
  return !n;
}

function sendError(ctx, err) {
  const ui = form.ui;
  const show = (msg) => {
    ui.sendError.textContent = msg;
    ui.sendError.hidden = !msg;
  };
  if (!err?.status) return show(N.err_network);
  if (err.status === 413) return show(copy('newRequest.err_size', { max: getMeta()?.limits?.max_upload_mb || 8 }));
  if (err.status === 403 && err.code === 'company_read_only') return show(N.err_read_only);
  if (err.status === 429) return show(N.err_rate);
  if (err.status >= 500) return show(N.err_network);
  if (err.status === 400 && err.details?.fields) {
    const map = err.details.fields;
    const typeErrs = {};
    for (const [k, v] of Object.entries(map)) if (k.startsWith('fields.')) typeErrs[k.slice(7)] = v;
    ui.typeFields.setErrors(typeErrs);
    if (map.description) ui.descWrap.setError(map.description);
    if (map.upload_ids) ui.docWrap.setError(map.upload_ids);
    if (map.title) ui.titleWrap.setError(map.title);
    if (map.urgent_reason) ui.reasonWrap.setError(map.urgent_reason);
    if (map.entity_id && ui.entityWrap) ui.entityWrap.setError(map.entity_id);
    if (map.needed_by) ui.neededWrap.setError(map.needed_by);
    const step1 = Object.keys(typeErrs).length || map.description || map.upload_ids || map.title;
    show(copy('newRequest.review', { n: countOf(Object.keys(map).length, 'field') }));
    if (step1 && form.step === 2 && !wide()) ctx.navigate(`/requests/new/${form.type}`);
    return;
  }
  show(err.message || N.err_network);
}

async function send(ctx) {
  const f = form;
  const ui = f.ui;
  if (ui.send.classList.contains('is-loading')) return;
  ui.sendError.hidden = true;
  if (!validateStep1()) {
    if (!wide() && f.step === 2) ctx.navigate(`/requests/new/${f.type}`);
    ui.sendError.textContent = ui.step1Alert.textContent;
    ui.sendError.hidden = false;
    return;
  }
  if (!validateStep2()) {
    ui.sendError.textContent = ui.step2Alert.textContent;
    ui.sendError.hidden = false;
    return;
  }
  setBusy(ui.send, true);
  const page = ui.s1.closest('.co-nr');
  page?.setAttribute('aria-busy', 'true');
  page?.querySelectorAll('input, select, textarea, .co-nr-s1 button, .co-nr-s2 button').forEach((el) => (el.disabled = true));
  try {
    try {
      await loadPlan(true);
      ui.refreshSummary();
    } catch {
      /* الإرسال يحسب الوعد على الخادم على أي حال */
    }
    const vals = ui.typeFields.values();
    const body = {
      type: f.type,
      title: (f.title || '').trim() || undefined,
      description: f.description.trim(),
      fields: { ...vals, output_language: f.output_language },
      upload_ids: ui.uploader.uploadIds(),
      priority: f.priority,
      urgent_reason: f.priority === 'urgent' ? f.urgent_reason.trim() : undefined,
      needed_by: f.needed_by || undefined,
      visibility: f.visibility,
      watcher_ids: f.watcher_ids.length ? f.watcher_ids : undefined,
      entity_id: f.entity_id || undefined,
      client_ref: f.client_ref,
    };
    const res = await api.post('/company/requests', body);
    clearInterval(ui.timer);
    clearDraft();
    S.home = null;
    form.done = res;
    window.history.replaceState(null, '', `#/requests/new/${f.type}?sent=${encodeURIComponent(res.request?.code || '')}`);
    mount(page.parentElement, confirmation(ctx, res));
  } catch (err) {
    sendError(ctx, err);
  } finally {
    setBusy(ui.send, false);
    page?.removeAttribute('aria-busy');
    page?.querySelectorAll('input, select, textarea, .co-nr-s1 button, .co-nr-s2 button').forEach((el) => (el.disabled = false));
  }
}

// ───────────────────────── التأكيد (U10-40) ─────────────────────────
function confirmation(ctx, res) {
  const r = res.request || {};
  const p = r.promise || {};
  const urgentClock = r.priority === 'urgent';
  const outScope = !!form?.outScope;
  const plan = cache.plan;
  const el = h(
    'div.co-page.co-done-page',
    h(
      'section.co-done',
      h('span.co-done-icon', { 'aria-hidden': 'true' }, icon('checkCircle', { size: 48 })),
      h('h1.co-h1', { tabindex: '-1' }, N.done_title),
      h('p.co-done-code', codeTag(r.code), h('span', { dir: 'auto' }, r.title)),
      p.first_response_by ? h('p', copy('promise.first_response', { when: whenLong(p.first_response_by) })) : null,
      p.delivery_estimate_text ? h('p', copy('promise.typical', { duration: p.delivery_estimate_text })) : null,
      !urgentClock && plan?.business_hours_text ? h('p.co-summary-muted', copy('newRequest.business_hours', { text: plan.business_hours_text })) : null,
      res.notice_text ? alertBox(res.notice_text, 'warning') : null,
      h('div.co-done-next', h('h2.co-section-title', N.next_title), h('p', N.next_1), h('p', copy('newRequest.next_2')), h('p', N.next_3), outScope ? h('p', N.next_4) : null),
      h('div.co-done-actions', button(N.follow, { variant: 'primary', href: `#/requests/${encodeURIComponent(r.code)}` }), button(N.another, { variant: 'secondary', onClick: () => { form = null; ctx.navigate('/requests/new'); } })),
      h('a.co-link', { href: '#/overview' }, N.to_overview),
    ),
  );
  requestAnimationFrame(() => {
    el.querySelector('h1')?.focus();
    haptic('success');
  });
  return el;
}

const wide = () => {
  try {
    return window.matchMedia('(min-width: 1024px)').matches;
  } catch {
    return false;
  }
};

// ───────────────────────── الصفحة ─────────────────────────
export default async function newRequest(ctx) {
  const type = ctx.params.type;
  if (!type) return tiles(ctx);
  // صفحة التأكيد بعد إعادة التحميل ← صفحة الطلب نفسه
  if (ctx.query.sent && /^[A-Z]{2,5}-\d{4,6}$/.test(ctx.query.sent)) {
    ctx.navigate(`/requests/${ctx.query.sent}`, { replace: true });
    return h('div');
  }
  const t = typeByKey(type);
  if (!t) return errorView(N.title, { status: 404 }, null, { label: N.back_types, href: '#/requests/new' });
  if (form?.done) form = null;
  if (!form || form.type !== type) {
    const d = readDraft();
    const carry = form ? { description: form.description, uploads: form.ui?.uploader?.entries() || form.uploads } : null;
    form = newForm(type, d && d.type === type ? d : null, carry);
  }
  const f = form;
  if (!f.ui) {
    let data;
    try {
      const [plan, ents, cols, cps, mem] = await Promise.all([
        loadPlan(),
        api.get('/company/entities').catch(() => ({ items: [] })),
        api.get('/company/colleagues').catch(() => ({ items: [] })),
        api.get('/company/counterparties').catch(() => ({ items: [] })),
        api.get('/company/memory', { kind: 'contract,licence,template', limit: 300 }).catch(() => ({ items: [] })),
      ]);
      data = { plan, entities: ents.items || [], colleagues: cols.items || [], counterparties: cps.items || [], memory: mem.items || [] };
    } catch (err) {
      return errorView(N.title, err, () => ctx.reload());
    }
    // ?from=<id>: الإشارة إلى عنصر الذاكرة والطرف الآخر من العنصر نفسه (U10-62)
    if (ctx.query.from && !Object.keys(f.fields).length) {
      const id = Number(ctx.query.from);
      const item = data.memory.find((m) => m.id === id);
      if (FROM_FIELD[type] && item) f.fields[FROM_FIELD[type]] = id;
      const keys = typeFields(type).map((x) => x.key);
      const party = item?.counterparty?.name;
      if (party) for (const k of ['counterparty_name', 'supplier_name']) if (keys.includes(k)) f.fields[k] = party;
    }
    f.ui = buildUi(ctx, data);
  }
  const step = !wide() && ctx.query.step === '2' ? 2 : 1;
  if (step === 2 && !validateStep1()) {
    window.history.replaceState(null, '', `#/requests/new/${type}`);
  } else f.step = step;
  if (f.step === 2) {
    // L-54: مدخلات الوعد من جديد عند فتح «الموعد والخصوصية»
    loadPlan(true).then(() => f.ui.refreshSummary()).catch(() => {});
  }
  saveDraftSoon();
  const next = button(N.next, {
    variant: 'primary',
    block: true,
    size: 'lg',
    onClick: () => {
      if (!validateStep1()) return;
      f.step = 2;
      saveDraftSoon();
      ctx.navigate(`/requests/new/${type}?step=2`);
    },
  });
  const typeLine = h(
    'div.co-nr-typeline.co-desk-only',
    h('span', copy('newRequest.type_line', { label: t.company_label })),
    button(N.change, {
      variant: 'link',
      size: 'sm',
      onClick: async () => {
        const n = f.ui.typeFields.changed();
        if (n && !(await confirmDialog({ title: N.change_title, message: copy('newRequest.change_text', { label: t.company_label, n: countOf(n, 'field') }), confirmLabel: N.change_confirm, cancelLabel: N.cancel }))) return;
        f.fields = {};
        ctx.navigate('/requests/new');
      },
    }),
  );
  ctx.setTitle(`${N.title} — ${t.company_label}`);
  // الرجوع من «الموعد والخصوصية» إلى «التفاصيل» (U10-28)
  window.dispatchEvent(new CustomEvent('co:back', { detail: f.step === 2 ? { label: N.step1, href: `#/requests/new/${type}` } : null }));
  return h(
    'div.co-page.co-nr',
    { dataset: { step: String(f.step) } },
    pageHead(t.company_label, null),
    typeLine,
    h('div.co-nr-grid', h('div.co-nr-main', f.ui.s1, f.ui.s2, h('div.co-nr-bar.co-nr-next', next)), f.ui.aside),
  );
}
