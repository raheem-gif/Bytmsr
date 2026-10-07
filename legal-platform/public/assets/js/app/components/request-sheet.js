// v9.1 l-work — «ماذا تحتاج؟»: لوحة الطلبات من صفحة الإسناد (L-04، L-19، L-23، وجانب المحامي من B91-16).
//
// الواجهة البرمجية:
//   openRequestSheet({ base, view, kind?, prefill?, onCreated(res, kind), onCounsel? }) → handle | null
//     base: '/lawyer/assignments/{id}'، view: عرض الإسناد من الخادم
//     kind: 'document' | 'information' | 'extension' | 'admin_question' لفتح نوع مباشرة (مثل «اطلب مهلة»)
//     prefill: نص يُدرج في حقل المستندات (مثل «صورة إعلام الوراثة» من شرائح تحليل المستند)
//   similarity(a, b) → 0..1   نسبة كلمات a الموجودة في b بعد توحيد الكتابة العربية
//   normTokens(text) → string[]
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { shortDate, isoToCairoDate, cairoDateToIso, cairoToday } from '../../lib/fmt.js';
import { modal, icon, button, toast, errorMessage, setBusy, uid } from '../../lib/ui.js';
import { deadline } from '../words.js';

const STOP = new Set(['من', 'في', 'على', 'الى', 'إلى', 'ان', 'إن', 'او', 'أو', 'و', 'هل', 'ما', 'عن', 'مع', 'ثم', 'كان', 'قد', 'لم', 'لا', 'نرجو', 'برجاء', 'رجاء', 'يرجى', 'اذا', 'إذا', 'بعد', 'ذلك', 'هذا', 'هذه', 'كل', 'اي', 'أي', 'وجد', 'وُجد', 'صدر', 'يصدر']);

/** كلمات مميزة بعد توحيد الكتابة: بلا تشكيل، أ/إ/آ → ا، ة → ه، ى → ي، وبلا «ال» و«و» في أول الكلمة */
export function normTokens(text) {
  return String(text || '')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOP.has(w))
    .map((w) => (w.length > 4 && w.startsWith('وال') ? w.slice(3) : w.length > 3 && w.startsWith('ال') ? w.slice(2) : w))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** صيغ الكلمة للمقارنة: كما هي، وبلا «و» العطف في أولها (دون إفساد كلمة تبدأ بالواو أصلًا مثل «وراثة») */
const forms = (w) => (w.length > 3 && w.startsWith('و') ? [w, w.slice(1)] : [w]);

/** نسبة كلمات النص المكتوب الموجودة في نص الطلب القائم */
export function similarity(typed, existing) {
  const a = [...new Set(normTokens(typed))];
  if (a.length < 2) return 0;
  const b = new Set(normTokens(existing).flatMap(forms));
  return a.filter((w) => forms(w).some((f) => b.has(f))).length / a.length;
}

const DUP_THRESHOLD = 0.6;
const STATUS_LINE = { sent_to_client: 'بانتظار الرد', client_replied: 'وصل الرد — تراجعه الإدارة' };
const REASONS = ['بانتظار مستند', 'ضغط جلسات', 'أحتاج وقتًا للبحث'];
const suggestCache = new Map();

function addDaysToDateKey(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** «المستفيد/ة» لا ينكسر عند الشرطة المائلة (فلا تبقى «ة» وحدها في سطر) */
function keepSlashWords(text) {
  return String(text)
    .split(/(\S*\/\S*)/)
    .filter(Boolean)
    .map((part) => (part.includes('/') ? h('span.lw-nowrap', part) : part));
}

/** يمرّر جسم اللوحة حتى يظهر العنصر كاملًا فوق زر الإرسال الثابت أسفلها */
function revealAboveFooter(el) {
  const body = el.closest('.modal-body');
  if (!body) return;
  const footer = body.querySelector('.lw-req-footer');
  const limit = footer ? footer.getBoundingClientRect().top : body.getBoundingClientRect().bottom;
  const over = el.getBoundingClientRect().bottom - limit + 8;
  if (over > 0) body.scrollBy({ top: over });
}

/** نص قصير مرئي لطلب قائم بلا تجاوز السطرين */
function clip(text, n = 140) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function openRequestSheet({ base, view, kind = null, prefill = '', onCreated, onCounsel } = {}) {
  const a = view.assignment;
  const open = (view.case_open_requests || []).filter((r) => r && r.client_message);
  // نص الطلب القائم كما وصل للمستفيد/ة: الرسالة وبنود الورق
  const openText = (r) => [r.client_message, ...(r.items || [])].join(' ');
  const activeAsg = ['assigned', 'in_progress', 'returned'].includes(a.status) && view.case.state !== 'closed';
  const pendingExtension = (view.info_requests || []).find((r) => r.own && r.kind === 'extension' && r.status === 'pending_admin');
  const clientRef = `lw-${a.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const body = h('div.lw-req');
  const handle = modal({ title: 'ماذا تحتاج؟', size: 'md', sheet: true, className: 'lw-sheet lw-req-sheet', body });
  const titleEl = handle.el.querySelector('.modal-title');
  const setTitle = (t) => {
    if (titleEl) titleEl.textContent = t;
  };

  let sending = false;
  const formError = h('div.lw-req-error', { role: 'alert', hidden: true });
  const showError = (msg) => {
    mount(formError, icon('alert', { size: 18 }), h('span', msg));
    formError.hidden = false;
  };
  const clearError = () => {
    formError.hidden = true;
  };

  async function send(btn, payload, label) {
    if (sending) return;
    clearError();
    sending = true;
    setBusy(btn, true);
    try {
      const res = await api.post(`${base}/info-requests`, { ...payload, client_ref: clientRef });
      suggestCache.delete(base); // ما طُلب الآن لا يُقترح مرة أخرى
      handle.close('action');
      if (onCreated) onCreated(res, payload.kind || 'duplicate');
      toast(label, 'success', 5000);
    } catch (err) {
      if (err && err.status === 0) showError('لا يوجد اتصال. ما كتبته باقٍ هنا؛ أعد الإرسال عند عودة الشبكة.');
      else showError(errorMessage(err));
    } finally {
      sending = false;
      setBusy(btn, false);
    }
  }

  // ───────── «مطلوب بالفعل من المستفيد/ة» + «أحتاج هذا أيضًا» ─────────
  function openBox() {
    if (!open.length) return null;
    return h(
      'section.lw-already',
      h('h3.lw-already-title', 'مطلوب بالفعل من المستفيد/ة:'),
      h(
        'ul.lw-already-list',
        open.map((r) => {
          const btn = r.joined
            ? h('span.lw-already-joined', icon('checkCircle', { size: 16 }), 'طلبته — سيصلك الرد')
            : button('أحتاج هذا أيضًا', {
                variant: 'secondary',
                size: 'sm',
                className: 'lw-already-btn',
                onClick: (e) => send(e.currentTarget, { duplicate_of_id: r.id }, 'سيصلك الرد نفسه عند وصوله، دون سؤال المستفيد/ة مرة أخرى.'),
              });
          return h(
            'li.lw-already-item',
            { dataset: { requestId: r.id } },
            h('p.lw-already-text', { dir: 'auto' }, clip(r.client_message), h('span.lw-already-meta', ` — طُلب ${shortDate(r.sent_at)} · ${STATUS_LINE[r.status] || 'بانتظار الرد'}`)),
            r.items && r.items.length ? h('ul.lw-items', r.items.map((x) => h('li', { dir: 'auto' }, x))) : null,
            btn,
          );
        }),
      ),
    );
  }

  /** تنبيه «يشبه طلبًا قائمًا» أثناء الكتابة */
  function dupWarner(getTexts) {
    const el = h('p.lw-dup', { role: 'status', hidden: true });
    const check = () => {
      let hit = null;
      for (const t of getTexts()) {
        for (const r of open) {
          if (similarity(t, openText(r)) >= DUP_THRESHOLD || (r.items || []).some((x) => similarity(t, x) >= DUP_THRESHOLD)) {
            hit = r;
            break;
          }
        }
        if (hit) break;
      }
      if (hit) {
        const shown = hit.items && hit.items.length ? `${clip(hit.client_message, 60)} (${hit.items.join('، ')})` : clip(hit.client_message, 90);
        // الزر هنا أيضًا: قائمة «مطلوب بالفعل» قد تكون خارج الشاشة فوق لوحة المفاتيح
        const join = hit.joined
          ? h('span.lw-already-joined', icon('checkCircle', { size: 16 }), 'طلبته — سيصلك الرد')
          : button('أحتاج هذا أيضًا', {
              variant: 'secondary',
              size: 'sm',
              className: 'lw-dup-join',
              onClick: (e) => send(e.currentTarget, { duplicate_of_id: hit.id }, 'سيصلك الرد نفسه عند وصوله، دون سؤال المستفيد/ة مرة أخرى.'),
            });
        mount(el, icon('alert', { size: 16 }), h('span', `يشبه طلبًا قائمًا: «${shown}». اضغط «أحتاج هذا أيضًا» بدل إرسال طلب جديد.`), join);
        const appeared = el.hidden;
        el.hidden = false;
        // يظهر كاملًا مع زره فوق زر الإرسال الثابت (مرة واحدة عند ظهوره، لا مع كل حرف)
        if (appeared) requestAnimationFrame(() => revealAboveFooter(el));
      } else el.hidden = true;
    };
    return { el, check };
  }

  function backLink() {
    return h('button.lw-req-back', { type: 'button', onClick: () => tiles() }, icon('arrowRight', { size: 18 }), h('span', 'رجوع'));
  }

  function footer(primary) {
    return h('div.lw-req-footer', formError, primary);
  }

  // ───────── الشاشة الأولى: أربعة اختيارات ─────────
  function tiles() {
    clearError();
    setTitle('ماذا تحتاج؟');
    const tile = (k, label, sub, iconName, disabled) =>
      h(
        'button.lw-tile',
        { type: 'button', disabled: !!disabled, dataset: { kind: k }, onClick: () => show(k) },
        h('span.lw-tile-icon', icon(iconName, { size: 22 })),
        h('span.lw-tile-text', h('strong', keepSlashWords(label)), sub && h('span.lw-tile-sub', sub)),
      );
    mount(
      body,
      h(
        'div.lw-tiles',
        tile('document', 'مستند من المستفيد/ة', null, 'paperclip'),
        tile('information', 'معلومة من المستفيد/ة', null, 'message'),
        activeAsg && a.due_at
          ? tile('extension', 'مهلة إضافية', pendingExtension ? 'طلبك عند الإدارة' : null, 'clock', !!pendingExtension)
          : null,
        tile('admin_question', 'سؤال للإدارة', null, 'shield'),
      ),
      onCounsel
        ? h('button.lw-req-counsel', { type: 'button', onClick: () => { handle.close('action'); onCounsel(); } }, icon('userPlus', { size: 18 }), h('span', 'مساعدة محامٍ آخر'))
        : null,
    );
    requestAnimationFrame(() => body.querySelector('.lw-tile:not([disabled])')?.focus({ preventScroll: true }));
  }

  // ───────── مستند (بنود، B91-16) ─────────
  function documentForm() {
    setTitle('طلب مستند من المستفيد/ة');
    const id = uid('lw-items');
    const ta = h('textarea.input.lw-req-input', {
      id,
      rows: 3,
      maxlength: 500,
      dir: 'auto',
      placeholder: 'شهادة وفاة الزوج\nعقد الشقة إن وُجد',
      'aria-describedby': `${id}-hint`,
    });
    if (prefill) ta.value = prefill;
    const lines = () => ta.value.split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const dup = dupWarner(lines);
    const grow = () => {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight + 2, 260)}px`;
    };
    ta.addEventListener('input', () => {
      clearError();
      dup.check();
      grow();
    });

    // اقتراحات (L-19): «صورة {doc}» في سطر جديد
    const chipsHost = h('div.lw-suggest', { hidden: true });
    const loadSuggestions = async () => {
      let items = suggestCache.get(base);
      if (!items) {
        try {
          items = ((await api.get(`${base}/suggested-documents`, undefined, { background: true })) || {}).items || [];
          suggestCache.set(base, items);
        } catch {
          items = [];
        }
      }
      const current = lines().join('\n');
      const shown = items.filter((s) => !current.includes(s.label)).slice(0, 5);
      if (!shown.length) {
        chipsHost.hidden = true;
        return;
      }
      mount(
        chipsHost,
        h('span.lw-suggest-label', 'اقتراحات:'),
        shown.map((s) =>
          h(
            'button.lw-chip',
            {
              type: 'button',
              onClick: (e) => {
                const v = ta.value.replace(/\s+$/, '');
                ta.value = v ? `${v}\n${s.text}` : s.text;
                e.currentTarget.remove();
                if (!chipsHost.querySelector('.lw-chip')) chipsHost.hidden = true;
                dup.check();
                grow();
                ta.focus({ preventScroll: true });
                ta.setSelectionRange(ta.value.length, ta.value.length);
              },
            },
            icon('plus', { size: 14 }),
            h('span', s.label),
          ),
        ),
      );
      chipsHost.hidden = false;
    };
    loadSuggestions();

    // السبب للإدارة فقط (اختياري، مطوي)
    const reason = h('textarea.input', { id: uid('lw-reason'), rows: 3, maxlength: 2000, dir: 'auto' });
    const reasonWrap = h('div.lw-field', { hidden: true }, h('label.field-label', { htmlFor: reason.id }, 'سبب الطلب (للإدارة فقط، اختياري)'), reason);
    const reasonToggle = h(
      'button.lw-more-link',
      {
        type: 'button',
        onClick: () => {
          reasonWrap.hidden = false;
          reasonToggle.hidden = true;
          reason.focus();
        },
      },
      '+ سبب الطلب (للإدارة فقط، اختياري)',
    );

    const submit = button('أرسل للإدارة', {
      variant: 'primary',
      icon: 'send',
      block: true,
      onClick: (e) => {
        const items = lines();
        if (!items.length || items.join('').length < 5) {
          showError('اكتب المستند المطلوب (5 أحرف على الأقل).');
          ta.focus();
          return;
        }
        if (items.length > 5) return showError('الحد الأقصى 5 مستندات في الطلب الواحد؛ قسّمها على طلبين.');
        const long = items.find((x) => x.length > 80);
        if (long) return showError(`اختصر اسم المستند إلى 80 حرفًا: «${clip(long, 40)}»`);
        send(e.currentTarget, { kind: 'document', items, reason: reason.value.trim() || undefined }, 'أُرسل طلبك للإدارة. سيصلك إشعار عند وصول الرد.');
      },
    });

    mount(
      body,
      backLink(),
      openBox(),
      h(
        'div.lw-field',
        h('label.field-label', { htmlFor: id }, 'المستندات المطلوبة (مستند في كل سطر)'),
        chipsHost,
        ta,
        h('p.field-hint', { id: `${id}-hint` }, 'تظهر للمستفيد/ة قائمةً تصوّر كل بند منها على حدة، بعد موافقة الإدارة.'),
        dup.el,
      ),
      reasonToggle,
      reasonWrap,
      footer(submit),
    );
    grow();
    dup.check();
    requestAnimationFrame(() => {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  }

  // ───────── معلومة ─────────
  function informationForm() {
    setTitle('معلومة من المستفيد/ة');
    const id = uid('lw-q');
    const ta = h('textarea.input.lw-req-input', { id, rows: 3, maxlength: 3000, dir: 'auto', placeholder: 'مثال: هل للمتوفى أبناء من زواج آخر؟' });
    const dup = dupWarner(() => [ta.value]);
    ta.addEventListener('input', () => {
      clearError();
      dup.check();
    });
    const submit = button('أرسل للإدارة', {
      variant: 'primary',
      icon: 'send',
      block: true,
      onClick: (e) => {
        const q = ta.value.trim();
        if (q.length < 5) {
          showError('اكتب المطلوب (5 أحرف على الأقل).');
          ta.focus();
          return;
        }
        send(e.currentTarget, { kind: 'information', question: q }, 'أُرسل طلبك للإدارة. سيصلك إشعار عند وصول الرد.');
      },
    });
    mount(body, backLink(), openBox(), h('div.lw-field', h('label.field-label', { htmlFor: id }, 'ما المطلوب؟'), ta, dup.el), footer(submit));
    requestAnimationFrame(() => ta.focus({ preventScroll: true }));
  }

  // ───────── مهلة إضافية ─────────
  function extensionForm() {
    setTitle('مهلة إضافية');
    const dueKey = isoToCairoDate(a.due_at);
    // المهلة لا تنتهي في الماضي: إن كان الموعد قد فات، فأقرب يوم هو الغد والافتراضي بعد يومين من اليوم
    const todayKey = cairoToday();
    const later = (x, y) => (x > y ? x : y);
    const maxKey = addDaysToDateKey(dueKey, 60);
    const minKey = later(addDaysToDateKey(dueKey, 1), addDaysToDateKey(todayKey, 1));
    let defKey = later(addDaysToDateKey(dueKey, 3), addDaysToDateKey(todayKey, 2));
    if (defKey > maxKey) defKey = maxKey;
    const id = uid('lw-day');
    const day = h('input.input.lw-date', { id, type: 'date', min: minKey, max: maxKey, value: defKey, required: true });
    const preview = h('p.field-hint');
    const syncPreview = () => {
      const iso = day.value ? cairoDateToIso(day.value) : null;
      preview.textContent = iso ? `الموعد الحالي: ${deadline(a.due_at)}` : '';
    };
    day.addEventListener('change', () => {
      clearError();
      syncPreview();
    });
    syncPreview();
    let reason = null;
    const reasonBtns = REASONS.map((r) =>
      h(
        'button.lw-chip.is-choice',
        {
          type: 'button',
          'aria-pressed': 'false',
          onClick: () => {
            reason = reason === r ? null : r;
            reasonBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === reason)));
          },
        },
        r,
      ),
    );
    const note = h('textarea.input', { rows: 2, maxlength: 1000, dir: 'auto', id: uid('lw-note') });
    const noteWrap = h('div.lw-field', { hidden: true }, h('label.field-label', { htmlFor: note.id }, 'ملاحظة (اختيارية)'), note);
    const noteToggle = h('button.lw-more-link', { type: 'button', onClick: () => {
      noteWrap.hidden = false;
      noteToggle.hidden = true;
      note.focus();
    } }, '+ ملاحظة');
    const submit = button('اطلب المهلة', {
      variant: 'primary',
      icon: 'clock',
      block: true,
      onClick: (e) => {
        if (!day.value || day.value < minKey || day.value > maxKey) {
          showError('اختر يومًا بعد موعد التسليم الحالي (حتى 60 يومًا).');
          day.focus();
          return;
        }
        send(e.currentTarget, { kind: 'extension', requested_due_date: day.value, reason: reason || undefined, note: note.value.trim() || undefined }, 'أُرسل طلب المهلة للإدارة. سيظهر ردها في «الطلبات».');
      },
    });
    mount(
      body,
      backLink(),
      h('div.lw-field', h('label.field-label', { htmlFor: id }, 'حتى أي يوم؟'), day, preview),
      h('div.lw-chips', { role: 'group', 'aria-label': 'السبب' }, reasonBtns, noteToggle),
      noteWrap,
      footer(submit),
    );
  }

  // ───────── سؤال للإدارة ─────────
  function adminQuestionForm() {
    setTitle('سؤال للإدارة');
    const id = uid('lw-aq');
    const ta = h('textarea.input.lw-req-input', { id, rows: 3, maxlength: 3000, dir: 'auto' });
    const submit = button('أرسل للإدارة', {
      variant: 'primary',
      icon: 'send',
      block: true,
      onClick: (e) => {
        const q = ta.value.trim();
        if (q.length < 5) {
          showError('اكتب سؤالك (5 أحرف على الأقل).');
          ta.focus();
          return;
        }
        send(e.currentTarget, { kind: 'admin_question', question: q }, 'أُرسل سؤالك للإدارة. سيظهر ردها في «الطلبات».');
      },
    });
    ta.addEventListener('input', clearError);
    mount(body, backLink(), h('div.lw-field', h('label.field-label', { htmlFor: id }, 'سؤالك'), ta), footer(submit));
    requestAnimationFrame(() => ta.focus({ preventScroll: true }));
  }

  function show(k) {
    clearError();
    if (k === 'document') documentForm();
    else if (k === 'information') informationForm();
    else if (k === 'extension') extensionForm();
    else if (k === 'admin_question') adminQuestionForm();
    else tiles();
  }

  if (kind === 'extension' && (!activeAsg || !a.due_at || pendingExtension)) {
    tiles();
    if (pendingExtension) toast('طلب المهلة عند الإدارة بالفعل؛ سيظهر ردها في «الطلبات».', 'info');
  } else show(kind || (prefill ? 'document' : null));
  return handle;
}
