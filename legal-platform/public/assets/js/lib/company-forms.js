// الإصدار 10 — نماذج بوابة الشركات (L-43؛ عقد POR-0 — التواقيع ثابتة). تُحمَّل عند الحاجة فقط (طلب جديد، الذاكرة،
// أوراق فريق المكتب)، فلا تدخل حزمة الدخول الأولى (§8.4). الحقول من الكتالوج المشترك lib/company-catalog-fields.js.
//
//   coUploader({ max = 5, perRequestLeft = 30, capture = true, titlePrefix = '', onChange, initial = [] })
//     → { el, uploadIds(), pending(), failed(), entries(), clear(), setError(msg) }
//     الرفع على مراحل (L-27): كل ملف يُرسل فور اختياره إلى POST /api/company/uploads واحدًا بعد الآخر، بنسبة تقدم لكل ملف
//     و«أُرفق 3 من 5»، وإعادة محاولة للملف الذي فشل وحده؛ 429 busy ← إعادة تلقائية بمهلة متزايدة. initial يعيد ما رُفع من المسودة.
//   coTypeFields(typeKey, values, { entities, counterparties, memoryItems, onChange, contractValueCap, between })
//     between: عناصر تُدرج بين الحقول الأساسية و«تفاصيل إضافية (اختياري)» (المستند المطلوب والوصف؛ U10-29)
//     → { el, values(), validate() → { ok, errors, values, first }, setErrors(map), changed() }
//   coRequestFields(typeKey, fields) → Element        حقول الطلب كما أُرسلت (للمعاينة عند فريق المكتب أيضًا)
//   coMemoryForm(kind, values, { staff = false, admin = false, entities, counterparties, onSubmit, submitLabel }) → { el, values(), validate() }
//   coMemoryFields(item) → Element
import { h, mount } from './h.js';
import { icon, button, field, uid, kv, errorMessage } from './ui.js';
import { getMeta, count, money, date as fmtDate, cairoToday } from './fmt.js';
import { formatBytes } from './api.js';
import {
  typeFields,
  memoryFields,
  memoryKindByKey,
  validateFields,
  validateMemory,
  computeMemoryDates,
  CAP_NOTE,
  MEMORY_COMMON_FIELDS,
  CURRENCIES,
} from './company-catalog-fields.js';
import { compressToBlob, fileToUpload, sendWithProgress } from '../public/upload.js';
import { W } from '../company/words-flows.js';
import { copy } from './company-ui.js';

// ───────────────────────── الرفع على مراحل (L-27) ─────────────────────────
const EXT_MIME = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heic',
  txt: 'text/plain',
};
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.heic,.txt,application/pdf,image/jpeg,image/png,image/webp,image/heic';
const mimeOf = (f) => {
  const t = String(f?.type || '').toLowerCase();
  if (t && t !== 'application/octet-stream') return t === 'image/jpg' ? 'image/jpeg' : t === 'image/heif' ? 'image/heic' : t;
  return EXT_MIME[String(f?.name || '').split('.').pop().toLowerCase()] || t;
};
const isCoarse = () => {
  try {
    return !!window.matchMedia?.('(pointer: coarse)').matches;
  } catch {
    return false;
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pctText = (x) => `${Math.round(Math.max(0, Math.min(1, x)) * 100)}٪`;

export function coUploader({ max = 5, perRequestLeft = 30, capture = true, titlePrefix = '', onChange, initial = [] } = {}) {
  const meta = getMeta() || {};
  const maxMb = Number(meta.limits?.max_upload_mb) || 8;
  const allowed = new Set(meta.limits?.mime || Object.values(EXT_MIME));
  const limit = Math.max(0, Math.min(max, perRequestLeft));
  const id = uid('co-up');
  let entries = (Array.isArray(initial) ? initial : [])
    .filter((x) => x && x.upload_id && (!x.expires_at || Date.parse(x.expires_at) > Date.now()))
    .slice(0, limit)
    .map((x) => ({ key: uid('f'), name: x.filename || x.name || '', size: x.size || 0, mime: x.mime || '', status: 'done', pct: 1, upload_id: x.upload_id, expires_at: x.expires_at || null }));
  let photoN = 0;
  let running = false;
  const errEl = h('p.co-up-error', { role: 'alert', hidden: true });
  const live = h('p.co-up-progress', { 'aria-live': 'polite' });
  const listEl = h('ul.co-up-list', { 'aria-label': W.uploader.list_label });
  const another = h('div.co-up-another', { hidden: true });
  const fileInput = h('input.file-native', { type: 'file', id: `${id}-file`, multiple: true, accept: ACCEPT, onChange: () => takeFiles(fileInput) });
  const camInput = h('input.file-native', { type: 'file', id: `${id}-cam`, accept: 'image/*', capture: 'environment', onChange: () => takeFiles(camInput, true) });
  const setError = (msg) => {
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  };
  const emit = () => {
    try {
      onChange?.(api.entries());
    } catch {
      /* لا نوقف الرفع بسبب خطأ في الصفحة */
    }
  };

  function render() {
    mount(
      listEl,
      entries.map((e) => {
        const status =
          e.status === 'done'
            ? h('span.co-up-state.is-done', icon('check', { size: 14 }), formatBytes(e.size))
            : e.status === 'failed'
              ? h('span.co-up-state.is-failed', icon('alert', { size: 14 }), h('span', e.error || copy('uploader.failed', { name: e.name })), ' ', button(W.uploader.retry, { variant: 'link', size: 'sm', onClick: () => retry(e) }))
              : h('span.co-up-state', copy('uploader.uploading', { pct: pctText(e.pct) }));
        return h(
          'li.co-up-item',
          { class: `is-${e.status}` },
          h('span.co-up-icon', { 'aria-hidden': 'true' }, icon(/^image\//.test(e.mime) ? 'paperclip' : 'fileText', { size: 18 })),
          h('span.co-up-main', h('span.co-up-name', { dir: 'auto' }, e.name), status, e.status === 'uploading' ? h('span.co-up-bar', { 'aria-hidden': 'true' }, h('span', { style: { width: `${Math.round(e.pct * 100)}%` } })) : null),
          h('button.co-up-remove', { type: 'button', 'aria-label': copy('uploader.remove_name', { name: e.name }), onClick: () => remove(e) }, icon('x', { size: 16 })),
        );
      }),
    );
    listEl.hidden = !entries.length;
    const done = entries.filter((e) => e.status === 'done').length;
    live.textContent = entries.length ? copy('uploader.progress', { k: done, n: entries.length }) : '';
    another.hidden = !(photoN > 0 && entries.length < limit);
  }
  let raf = 0;
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(() => ((raf = 0), render()));
  };
  function remove(e) {
    entries = entries.filter((x) => x !== e);
    e.removed = true;
    setError('');
    render();
    emit();
  }
  async function takeFiles(input, fromCamera = false) {
    const files = [...(input.files || [])];
    input.value = '';
    setError('');
    for (const f of files) {
      if (entries.length >= limit) {
        setError(limit < max ? W.uploader.request_full : W.uploader.count);
        break;
      }
      const mime = mimeOf(f);
      if (/^(audio|video)\//.test(mime)) {
        setError(W.uploader.type);
        continue;
      }
      if (!allowed.has(mime)) {
        setError(W.uploader.type_other);
        continue;
      }
      let file = f;
      let name = f.name || 'ملف';
      if (fromCamera || /^image\/(jpeg|png|webp)$/.test(mime)) {
        if (fromCamera) {
          photoN += 1;
          name = `${titlePrefix}${copy('uploader.photo_title', { i: photoN })}`;
        }
        try {
          file = await compressToBlob(f, { maxSide: 2000, quality: 0.8, name });
        } catch {
          file = f;
        }
        if (fromCamera) name = file.name || name;
      }
      if (file.size > maxMb * 1024 * 1024) {
        setError(copy('uploader.size', { max: maxMb }));
        continue;
      }
      entries.push({ key: uid('f'), name, size: file.size, mime: mimeOf(file) || mime, status: 'queued', pct: 0, file, title: fromCamera ? name : `${titlePrefix}${name}` });
    }
    render();
    emit();
    pump();
  }
  async function pump() {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const e = entries.find((x) => x.status === 'queued');
        if (!e) break;
        await upload(e);
        render();
        emit();
      }
    } finally {
      running = false;
    }
  }
  async function upload(e) {
    e.status = 'uploading';
    e.pct = 0;
    render();
    let payload;
    try {
      const up = await fileToUpload(e.file);
      payload = { file: { name: e.name, mime: e.mime, data_base64: up.data_base64 }, title: (e.title || e.name).slice(0, 200) };
    } catch {
      e.status = 'failed';
      e.error = copy('uploader.failed', { name: e.name });
      return;
    }
    for (let attempt = 0; attempt < 6 && !e.removed; attempt++) {
      try {
        const res = await sendWithProgress('/api/company/uploads', payload, {
          onProgress: (x) => {
            e.pct = x;
            schedule();
          },
        });
        if (e.removed) return;
        Object.assign(e, { status: 'done', pct: 1, upload_id: res.upload_id, size: res.size || e.size, expires_at: res.expires_at || null, file: null });
        return;
      } catch (err) {
        if (err.status === 401) window.dispatchEvent(new CustomEvent('auth:expired'));
        if (err.status === 429 && err.code === 'busy') {
          live.textContent = W.uploader.busy;
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        e.status = 'failed';
        e.error = err.status === 413 ? copy('uploader.size', { max: maxMb }) : err.status && err.message && err.status !== 500 ? `${copy('uploader.failed', { name: e.name })} — ${err.message}` : copy('uploader.failed', { name: e.name });
        return;
      }
    }
    if (!e.removed && e.status !== 'done') {
      e.status = 'failed';
      e.error = copy('uploader.failed', { name: e.name });
    }
  }
  function retry(e) {
    if (!e.file) return remove(e);
    e.status = 'queued';
    e.error = null;
    render();
    pump();
  }

  const camBtn = capture && isCoarse() ? h('label.btn.btn-secondary.co-up-btn', { htmlFor: camInput.id }, icon('upload', { size: 18 }), h('span', W.uploader.camera)) : null;
  const pickBtn = h('label.btn.btn-secondary.co-up-btn', { htmlFor: fileInput.id }, icon('paperclip', { size: 18 }), h('span', isCoarse() ? W.uploader.choose : W.uploader.choose_many));
  mount(another, h('label.btn.btn-ghost.btn-sm', { htmlFor: camInput.id }, icon('plus', { size: 16 }), h('span', W.uploader.another_page)));
  // لوحة المفاتيح: الحقل الأصلي مخفي، فحلقة التركيز تظهر على زره الظاهر (WCAG 2.4.7)؛ وبلا زر تصوير (الحاسوب) لا يُوقف
  // Tab على حقل كاميرا غير مرئي
  if (!camBtn) camInput.tabIndex = -1;
  for (const [inp, lab] of [[fileInput, pickBtn], [camInput, camBtn]]) {
    if (!lab) continue;
    inp.addEventListener('focus', () => lab.classList.toggle('is-focus', inp.matches(':focus-visible')));
    inp.addEventListener('blur', () => lab.classList.remove('is-focus'));
  }
  const zone = h(
    'div.co-up-zone',
    camBtn ? h('div.co-up-buttons', camBtn, pickBtn) : h('p.co-up-drop', h('span', W.uploader.drop), ' ', pickBtn),
    h('p.co-up-hint', copy('uploader.hint', { max: maxMb })),
  );
  zone.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    zone.classList.add('is-dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
  zone.addEventListener('drop', (ev) => {
    ev.preventDefault();
    zone.classList.remove('is-dragover');
    if (ev.dataTransfer?.files?.length) takeFiles({ files: ev.dataTransfer.files, set value(v) {} });
  });
  const el = h('div.co-uploader', fileInput, camInput, zone, another, errEl, listEl, live);
  render();
  const api = {
    el,
    uploadIds: () => entries.filter((e) => e.status === 'done' && e.upload_id).map((e) => e.upload_id),
    pending: () => entries.filter((e) => e.status === 'queued' || e.status === 'uploading').length,
    failed: () => entries.filter((e) => e.status === 'failed').length,
    entries: () => entries.filter((e) => e.status === 'done').map((e) => ({ upload_id: e.upload_id, filename: e.name, size: e.size, mime: e.mime, expires_at: e.expires_at })),
    names: () => entries.map((e) => e.name),
    clear: () => {
      entries.forEach((e) => (e.removed = true));
      entries = [];
      photoN = 0;
      setError('');
      render();
      emit();
    },
    setError,
  };
  return api;
}

// ───────────────────────── عارض الحقول المشترك ─────────────────────────
const PLACEHOLDER = '— اختاروا —';
function optionLabel(spec, v) {
  if (Array.isArray(v)) return v.map((x) => optionLabel(spec, x)).join('، ');
  return spec.options?.find((o) => String(o.key) === String(v))?.label ?? v;
}

/** عنصر تحكم لحقل من الكتالوج → { wrap, get(), set(v), focus(), input } */
function control(spec, value, ctx) {
  const idf = uid(`co-${spec.key}`);
  const hintEl = h('p.field-note', { hidden: true });
  let input;
  let get;
  let set;
  let el;
  const note = (txt) => {
    hintEl.replaceChildren(...(txt ? [icon('info', { size: 14 }), h('span', txt)] : []));
    hintEl.hidden = !txt;
  };
  switch (spec.kind) {
    case 'textarea':
      input = h('textarea.input', { id: idf, rows: 4, dir: 'auto', maxlength: spec.max || null, placeholder: spec.placeholder || null });
      get = () => input.value.trim();
      set = (v) => (input.value = v == null ? '' : String(v));
      break;
    case 'memory_ref':
      if (spec.key === 'template_memory_id') {
        // «استخدام نموذج السرية المعتمد لديكم: {العنوان}» (مفعّل افتراضيًا) حين يوجد نموذج معتمد في الذاكرة
        const ts = (ctx.memoryItems || []).filter((m) => m.kind === 'template');
        const t = ts.find((m) => /سري|NDA/i.test(m.title)) || ts[0];
        input = h('input', { id: idf, type: 'checkbox' });
        el = h('label.check.check-single', { htmlFor: idf }, input, h('span', t ? `${spec.label}: ${t.title}` : spec.label));
        get = () => (t && input.checked ? t.id : '');
        set = (v) => (input.checked = !!t && (v == null || v === '' ? true : Number(v) === t.id));
        if (!t) el.hidden = true;
        break;
      }
    // falls through
    case 'select':
    case 'entity': {
      const opts = spec.kind === 'entity' ? (ctx.entities || []).map((e) => ({ key: e.id, label: e.name })) : spec.kind === 'memory_ref' ? (ctx.memoryItems || []).filter((m) => !spec.memory_kinds || spec.memory_kinds.includes(m.kind)).map((m) => ({ key: m.id, label: m.title })) : spec.options || [];
      input = h('select.input', { id: idf }, h('option', { value: '' }, spec.kind === 'memory_ref' && spec.key === 'memory_id' ? 'غير موجود في الذاكرة' : PLACEHOLDER), opts.map((o) => h('option', { value: String(o.key) }, o.label)));
      el = h('div.select-wrap', input);
      get = () => {
        const v = input.value;
        if (!v) return '';
        return spec.kind === 'select' ? (opts.find((o) => String(o.key) === v)?.key ?? v) : Number(v);
      };
      set = (v) => (input.value = v == null ? '' : String(v));
      input.addEventListener('change', () => note(opts.find((o) => String(o.key) === input.value)?.note || ''));
      break;
    }
    case 'multi':
    case 'multi_int': {
      let sel = new Set();
      const btns = (spec.options || []).map((o) =>
        h('button.chip-toggle', { type: 'button', 'aria-pressed': 'false', dataset: { v: String(o.key) }, onClick: (e) => { const k = o.key; if (sel.has(k)) sel.delete(k); else sel.add(k); sync(); e.currentTarget.dispatchEvent(new Event('input', { bubbles: true })); } }, icon('check', { size: 14 }), h('span', o.label)),
      );
      const sync = () => btns.forEach((b, i) => { const on = sel.has(spec.options[i].key); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('is-on', on); });
      el = h('div.chip-select', { id: idf, role: 'group' }, btns);
      input = btns[0];
      get = () => (spec.options || []).map((o) => o.key).filter((k) => sel.has(k));
      set = (v) => {
        const keys = new Set((Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(String));
        sel = new Set((spec.options || []).filter((o) => keys.has(String(o.key))).map((o) => o.key));
        sync();
      };
      break;
    }
    case 'date':
      input = h('input.input', { id: idf, type: 'date', dir: 'ltr', min: spec.future ? cairoToday() : null });
      get = () => input.value;
      set = (v) => (input.value = v ? String(v).slice(0, 10) : '');
      break;
    case 'money':
    case 'int':
      input = h('input.input', { id: idf, type: 'text', inputmode: spec.kind === 'money' ? 'decimal' : 'numeric', dir: 'ltr', autocomplete: 'off' });
      get = () => input.value.trim();
      set = (v) => (input.value = v == null ? '' : String(v));
      if (spec.cap_check) {
        input.addEventListener('input', () => {
          const n = Number(String(input.value).replace(/[,\s٬]/g, ''));
          note(ctx.contractValueCap && Number.isFinite(n) && n > ctx.contractValueCap ? CAP_NOTE : '');
        });
      }
      break;
    case 'bool': {
      input = h('input', { id: idf, type: 'checkbox' });
      el = h('label.check.check-single', { htmlFor: idf }, input, h('span', spec.label));
      get = () => input.checked;
      set = (v) => (input.checked = !!v);
      break;
    }
    default: {
      input = h('input.input', { id: idf, type: 'text', dir: 'auto', maxlength: spec.max || null, placeholder: spec.placeholder || null, autocomplete: 'off' });
      if (spec.counterparty && ctx.counterparties?.length) {
        const dl = h('datalist', { id: `${idf}-dl` }, ctx.counterparties.map((c) => h('option', { value: c.name })));
        input.setAttribute('list', dl.id);
        el = h('div', input, dl);
      }
      get = () => input.value.trim();
      set = (v) => (input.value = v == null ? '' : String(v));
    }
  }
  const boxed = spec.kind === 'bool' || spec.key === 'template_memory_id';
  const wrap = field(boxed ? null : spec.label, el || input, { hint: spec.hint, required: !!spec.required, group: spec.kind === 'multi' || spec.kind === 'multi_int', full: ['textarea', 'multi', 'multi_int'].includes(spec.kind) });
  // الإلزام لقارئات الشاشة (النجمة بصرية فقط)
  const ctl = input || el?.querySelector?.('input:not([type=hidden]), select, textarea');
  if (spec.required && ctl && !['checkbox', 'radio'].includes(ctl.type)) ctl.setAttribute('aria-required', 'true');
  wrap.append(hintEl);
  wrap.dataset.key = spec.key;
  set(value ?? (spec.default !== undefined ? spec.default : ''));
  if (input?.tagName === 'SELECT') input.dispatchEvent(new Event('change'));
  return { spec, wrap, get, set, input, focus: () => input?.focus?.() };
}

/** يربط التحقق المبكر/المتأخر (X10-F2): الخطأ عند مغادرة حقل فيه قيمة خاطئة، ويختفي مع الضغطة التي تصلحه */
function bindValidation(ctrls, check) {
  for (const c of ctrls) {
    const el = c.input;
    if (!el || el.type === 'checkbox') continue;
    let touched = false;
    el.addEventListener('blur', () => {
      const v = c.get();
      if (!touched && (v === '' || (Array.isArray(v) && !v.length))) return;
      touched = true;
      c.wrap.setError(check()[c.spec.key] || '');
    });
    el.addEventListener('input', () => {
      touched = true;
      if (c.wrap.classList.contains('has-error')) c.wrap.setError(check()[c.spec.key] || '');
    });
  }
}
const isEmpty = (v) => v === '' || v == null || (Array.isArray(v) && !v.length);

// ───────────────────────── حقول نوع الطلب (U10-29…31) ─────────────────────────
export function coTypeFields(typeKey, values = {}, { entities = [], counterparties = [], memoryItems = [], onChange, contractValueCap = null, between = null } = {}) {
  const ctx = { entities, counterparties, memoryItems, contractValueCap };
  const specs = typeFields(typeKey);
  const ctrls = specs.map((s) => control(s, values?.[s.key], ctx));
  const byKey = (k) => ctrls.find((c) => c.spec.key === k);
  const main = ctrls.filter((c) => c.spec.visible !== 'more');
  const more = ctrls.filter((c) => c.spec.visible === 'more');
  const moreOpen = more.some((c) => !isEmpty(c.get()) && c.get() !== c.spec.default);
  const vals = () => {
    const out = {};
    for (const c of ctrls) {
      const v = c.get();
      if (!isEmpty(v) && v !== false) out[c.spec.key] = v;
    }
    return out;
  };
  // «العقد أو الترخيص» من الذاكرة ← لا حاجة للاسم والتاريخ (required_unless)
  const syncUnless = () => {
    for (const c of ctrls) if (c.spec.required_unless) c.wrap.hidden = !isEmpty(byKey(c.spec.required_unless)?.get());
  };
  const check = () => validateFields(typeKey, vals()).errors;
  bindValidation(ctrls, check);
  const el = h(
    'div.co-type-fields',
    main.map((c) => c.wrap),
    between,
    more.length ? h('details.co-more', { open: moreOpen || null }, h('summary', W.newRequest.more), h('div.co-more-body', more.map((c) => c.wrap))) : null,
  );
  el.addEventListener('input', () => {
    syncUnless();
    onChange?.(vals());
  });
  el.addEventListener('change', () => {
    syncUnless();
    onChange?.(vals());
  });
  syncUnless();
  return {
    el,
    values: vals,
    changed: () => Object.keys(vals()).filter((k) => vals()[k] !== specs.find((s) => s.key === k)?.default).length,
    setErrors(map = {}) {
      let first = null;
      for (const c of ctrls) {
        const msg = map[c.spec.key] || map[`fields.${c.spec.key}`] || '';
        c.wrap.setError(msg);
        if (msg && !first) first = c;
      }
      if (first?.spec.visible === 'more') el.querySelector('details.co-more')?.setAttribute('open', '');
      return first;
    },
    validate() {
      const res = validateFields(typeKey, vals());
      const errors = res.errors;
      const first = this.setErrors(errors);
      return { ok: !Object.keys(errors).length, errors, values: vals(), first };
    },
  };
}

/** عرض حقول الطلب كما أُرسلت (ui.kv) */
export function coRequestFields(typeKey, fields = {}) {
  const specs = typeFields(typeKey);
  const src = fields && typeof fields === 'object' ? fields : {};
  const pairs = specs
    .filter((s) => !isEmpty(src[s.key]))
    .map((s) => {
      const v = src[s.key];
      let shown;
      if (s.kind === 'date') shown = fmtDate(`${String(v).slice(0, 10)}T10:00:00Z`);
      else if (s.kind === 'money') shown = h('span.num', src.currency && src.currency !== 'EGP' ? `${Number(v).toLocaleString('en-US')} ${CURRENCIES.find((c) => c.key === src.currency)?.label || src.currency}` : money(v));
      else if (s.kind === 'bool') shown = v ? 'نعم' : 'لا';
      else if (s.kind === 'memory_ref') shown = h('a', { href: `#/memory/item/${encodeURIComponent(v)}` }, 'عنصر في الذاكرة القانونية');
      else shown = h('span', { dir: 'auto' }, String(optionLabel(s, v)));
      return [s.label, shown];
    });
  if (src.output_language) pairs.push([W.newRequest.language, { ar: 'العربية', en: 'English', both: 'الاثنتان' }[src.output_language] || src.output_language]);
  return kv(pairs, { className: 'co-fields-kv' });
}

// ───────────────────────── نموذج عنصر الذاكرة (U10-63) ─────────────────────────
export function coMemoryForm(kind, values = {}, { staff = false, admin = false, entities = [], counterparties = [], onSubmit, submitLabel } = {}) {
  const meta = memoryKindByKey(kind);
  const ctx = { entities, counterparties };
  const src = { ...(values?.data || {}), ...(values || {}) };
  if (values?.counterparty?.name && !src.counterparty_name) src.counterparty_name = values.counterparty.name;
  const specs = [...memoryFields(kind), ...MEMORY_COMMON_FIELDS.filter((s) => (s.key === 'access' ? staff || admin : true))].filter((s) => !(s.kind === 'entity' && entities.length < 2));
  const ctrls = specs.map((s) => control(s.key === 'remind_days' ? { ...s, default: meta?.remind_days } : s, src[s.key], ctx));
  const byKey = (k) => ctrls.find((c) => c.spec.key === k);
  const alert = h('div.alert.alert-danger', { role: 'alert', hidden: true });
  const notice = h('p.co-memory-notice', { 'aria-live': 'polite' });
  const vals = () => {
    const out = {};
    for (const c of ctrls) {
      const v = c.get();
      if (!isEmpty(v)) out[c.spec.key] = v;
    }
    return out;
  };
  const syncShow = () => {
    for (const c of ctrls) if (c.spec.show_if) c.wrap.hidden = !Object.entries(c.spec.show_if).every(([k, v]) => byKey(k)?.get() === v);
    if (kind === 'contract') {
      const d = computeMemoryDates('contract', { end_date: byKey('end_date')?.get(), data: { renewal_type: byKey('renewal_type')?.get(), notice_days: Number(byKey('notice_days')?.get()) } });
      notice.textContent = d.notice_deadline ? `آخر موعد للإخطار: ${fmtDate(`${d.notice_deadline}T10:00:00Z`)}` : '';
    }
  };
  const check = () => validateMemory(kind, vals()).errors;
  bindValidation(ctrls, check);
  const submit = button(submitLabel || (kind === 'contract' ? 'حفظ العقد' : 'حفظ'), { variant: 'primary', type: 'submit' });
  const el = h('form.co-memory-form', { novalidate: true }, alert, ctrls.map((c) => c.wrap), kind === 'contract' ? notice : null, onSubmit ? h('div.form-actions', submit) : null);
  el.addEventListener('input', syncShow);
  el.addEventListener('change', syncShow);
  syncShow();
  const api = {
    el,
    values: vals,
    validate() {
      const { errors } = validateMemory(kind, vals());
      let first = null;
      for (const c of ctrls) {
        c.wrap.setError(errors[c.spec.key] || '');
        if (errors[c.spec.key] && !first) first = c;
      }
      first?.focus();
      return { ok: !Object.keys(errors).length, errors, values: vals() };
    },
    showError(err) {
      alert.replaceChildren(icon('alert', { size: 18 }), h('span', errorMessage(err)));
      alert.hidden = false;
      const map = err?.details?.fields || {};
      for (const c of ctrls) if (map[c.spec.key]) c.wrap.setError(map[c.spec.key]);
    },
  };
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit || submit.classList.contains('is-loading')) return;
    alert.hidden = true;
    if (!api.validate().ok) return;
    submit.classList.add('is-loading');
    submit.disabled = true;
    try {
      await onSubmit(vals(), api);
    } catch (err) {
      api.showError(err);
    } finally {
      submit.classList.remove('is-loading');
      submit.disabled = false;
    }
  });
  return api;
}

/** حقول عنصر ذاكرة للعرض (U10-61): التسميات من الكتالوج */
export function coMemoryFields(item = {}) {
  const data = { ...(item.data || {}), ...(item.dates || {}) };
  const pairs = memoryFields(item.kind)
    .filter((s) => s.key !== 'title' && s.key !== 'summary')
    .map((s) => {
      let v = s.column === 'counterparty' ? item.counterparty?.name : s.column === 'entity_id' ? item.entity?.name : s.column === 'value_minor' ? item.value : s.column ? item[s.column] ?? data[s.key] : data[s.key];
      if (s.kind === 'money' && !s.column) v = data[`${s.key}_minor`] != null ? data[`${s.key}_minor`] / 100 : v;
      if (isEmpty(v)) return null;
      if (s.kind === 'date') return [s.label, fmtDate(`${String(v).slice(0, 10)}T10:00:00Z`)];
      if (s.kind === 'money') return [s.label, h('span.num', money(v))];
      if (s.kind === 'bool') return [s.label, v ? 'نعم' : 'لا'];
      if (s.kind === 'int' && s.key === 'term_months') return [s.label, count(v, 'month')];
      if (s.kind === 'int' && /days/.test(s.key)) return [s.label, count(v, 'day')];
      return [s.label, h('span', { dir: 'auto' }, String(optionLabel(s, v)))];
    })
    .filter(Boolean);
  return kv(pairs, { className: 'co-fields-kv' });
}
