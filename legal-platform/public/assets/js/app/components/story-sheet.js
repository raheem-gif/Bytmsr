// v9.2 (admin-ai) — «اعمله طلب»: اقتراح الذكاء الاصطناعي في ورقة واحدة معبأة مسبقًا، والقرار بنقرة من الإدارة.
// خمسة مسارات: استشارة · قضية / ملف مستمر · ترد الإدارة · توجيه لجهة أخرى · نسألها الأول. لا شيء يصل للمستفيدة ولا للمحامي
// قبل الضغط على زر الإرسال هنا، والخادم يرفض القرار إن وصلت رسائل جديدة بعد فتح الاقتراح (409) إلا بـ «متابعة رغم ذلك».

import { h, frag, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { label, areaOptions, options, governorateOptions, cairoToday, toLatinDigits } from '../../lib/fmt.js';
import { modal, form, field, button, asyncButton, badge, icon, alertBox, toast, choiceTiles, errorMessage, uid } from '../../lib/ui.js';
import { programSelect } from './program-picker.js';
import { quickReplyPicker, insertAtCursor } from './quick-replies.js';
import { openCallNote, isSkeletonReply } from './call-note.js';
import { haptic } from '../../lib/haptics.js';
// v11 segment-staff (ST-3): نوع الخدمة في ورقة القرار — رأس الإرسال، واختيار إلزامي بلا افتراضي حين يكون «غير محدد»
import { sendHeader, segmentChoice, parseSeg, segLabel, REQUIRED_TEXT } from './segment-ui.js';

export const STORY_TRACKS = ['consultation', 'matter', 'internal', 'refer', 'need_info'];
/** ألوان شارة المسار المقترح في البطاقات والاقتراح */
export const TRACK_TONES = { consultation: 'primary', matter: 'accent', internal: 'success', refer: 'neutral', need_info: 'warning' };
const SUBMIT_LABELS = {
  consultation: 'تحويل وإصدار كود الملف',
  matter: 'فتح الملف والملف المستمر',
  internal: 'إرسال الرد وإغلاق الطلب',
  refer: 'إرسال التوجيه وإغلاق الطلب',
  need_info: 'إرسال الأسئلة',
};
const SUBMIT_ICONS = { consultation: 'briefcase', matter: 'gavel', internal: 'send', refer: 'send', need_info: 'send' };
const REPLY_CHANNELS = [
  { value: 'auto', label: 'تلقائي (آخر قناة تواصل منها المستفيدة)' },
  { value: 'whatsapp', label: 'واتساب' },
  { value: 'website', label: 'الموقع (صفحة المتابعة)' },
];
const PHONE_DELIVERY = 'بلّغتها في مكالمة — أغلق بدون رسالة';

/** رسالة تأكيد النجاح بعد القرار (§6.4/A92-19) + « (إرسال تجريبي)» عند المحاكاة */
export function acceptToast(res) {
  haptic('success'); // v10 (X10-M6): «اعمله طلب» قُبل (على الحاسوب: لا شيء)
  const sim = res.message && res.message.status === 'simulated' ? ' (إرسال تجريبي)' : '';
  let text;
  // [بوابة 9.2 G15] «(إرسال تجريبي)» يخص الرسالة التي وصلتها، لا اختيار المحامي
  if (res.track === 'consultation' && sim && res.message) {
    toast(`تم إنشاء الملف ${res.case?.code || ''} وأُرسلت لها رسالة${sim} — اختر الآن المحامي`, 'success', 6000);
    for (const w of res.warnings || []) toast(w.text, 'warning', 9000);
    return;
  }
  if (res.track === 'consultation') text = `تم إنشاء الملف ${res.case?.code || ''} — اختر الآن المحامي`;
  else if (res.track === 'matter') text = `تم إنشاء الملف ${res.case?.code || ''} والملف المستمر ${res.matter?.code || ''}`;
  else if (res.track === 'internal') text = res.message ? 'أُرسل الرد وأُغلق الطلب' : 'أُغلق الطلب دون رسالة';
  else if (res.track === 'refer') text = res.message ? 'أُرسل التوجيه وأُغلق الطلب' : 'أُغلق الطلب دون رسالة';
  else text = 'أُرسلت الأسئلة — الطلب بانتظار ردها';
  toast(`${text}${sim}`, 'success', 6000);
  for (const w of res.warnings || []) toast(w.text, 'warning', 9000);
}

/** أول متغير لم يُملأ في نص سيصلها ({portal_link} مسموح: يُستبدل عند الإرسال) */
export function unfilledVar(text) {
  for (const m of String(text || '').matchAll(/\{(\w+)\}/g)) if (m[1] !== 'portal_link') return m[0];
  return null;
}

/** يقسم نص «سؤال الأسئلة» حول قائمة الأسئلة المرقمة حتى يُعاد بناؤه عند تعديلها */
function splitQuestions(text, questions) {
  const block = questions.map((q, k) => `${k + 1}. ${q}`).join('\n');
  const at = block ? String(text || '').indexOf(block) : -1;
  if (at < 0) return null;
  return { before: text.slice(0, at), after: text.slice(at + block.length) };
}

/**
 * يفتح ورقة «اعمله طلب».
 * @param {object} opts
 * @param {number} opts.intakeId
 * @param {object} [opts.proposal] اقتراح GET …/proposal (يُطلب إن لم يُمرَّر)
 * @param {string} [opts.track] المسار المعروض أولًا (الافتراضي: المقترح، وإلا استشارة)
 * @param {string} [opts.name] اسم المستفيدة للعنوان الفرعي
 * @param {Array} [opts.staff] [{id,name,role}] لمدير الحالة (يُطلب إن لم يُمرَّر)
 * @param {number} [opts.userId] المستخدم الحالي (مدير الحالة الافتراضي)
 * @param {number} [opts.callNoteId] آخر مكالمة مسجلة (لـ «بلّغتها في مكالمة»)
 * @param {string} [opts.phone] رقمها (لنافذة المكالمة داخل الطلب فقط)
 * @param {string} [opts.channel] قناة الرد المختارة مسبقًا ('website' لـ «إرسال لصفحتها فقط»)
 * @param {boolean} [opts.focusTracks] «اختيار مسار آخر»: التركيز على اختيار المسار
 * @param {(res:object)=>void} [opts.onDone] بعد النجاح (الافتراضي: الانتقال إلى res.next)
 * @param {()=>void} [opts.onReview] «مراجعة الرسائل» (الافتراضي: فتح المحادثة في الطلب)
 * @param {(res:object)=>void} [opts.onCalled] بعد «اتصل بها» من داخل الورقة
 * @param {{segment:string, reasons:string[]}} [opts.segmentHint] v11: اقتراح نوع الخدمة لطلب «غير محدد» (لا يُطبَّق)
 */
export async function openStorySheet(opts = {}) {
  const { intakeId } = opts;
  const base = `/admin/intakes/${encodeURIComponent(intakeId)}`;
  const p = opts.proposal || (await api.get(`${base}/proposal`));
  let staff = opts.staff;
  if (!staff) {
    try {
      staff = await api.get('/admin/staff');
    } catch {
      staff = [];
    }
  }
  const recommended = p.track && STORY_TRACKS.includes(p.track.recommended) ? p.track.recommended : null;
  let track = STORY_TRACKS.includes(opts.track) ? opts.track : recommended || 'consultation';
  const rev = { value: Number(p.story && p.story.rev) || 0 };
  const unconfirmed = Boolean(p.identity && p.identity.unconfirmed);
  const channelHint = p.identity && p.identity.reply_channel && p.identity.reply_channel.text ? `يصل الرد: ${p.identity.reply_channel.text}.` : '';
  // رقمها لنافذة المكالمة (من صفحة الطلب، أو من الاقتراح حين تُفتح الورقة من بطاقة الفرز)
  const herPhone = opts.phone || (p.identity && p.identity.phone) || null;
  // [بوابة 9.2 N6] صيغة المخاطَب في نصوص الإدارة (رجل معروف: «أبو …» أو صيغة حددتها الإدارة)
  const addrForm = (p.identity && p.identity.form) || 'f';
  // [مراجعة 9.2] رقم غير مؤكد (B91-01): لا خيار «واتساب» يرفضه الخادم بعد الضغط — صفحة المتابعة فقط
  const replyChannels = unconfirmed ? REPLY_CHANNELS.filter((c) => c.value !== 'whatsapp') : REPLY_CHANNELS;
  const forms = new Map();
  let handle = null;
  let finished = null;

  // ───────────── v11 segment-staff (ST-3): نوع الخدمة ─────────────
  const segNow = parseSeg(p.segment);
  const segRequired = Boolean(p.segment_required) || !segNow;
  let segPick = segNow; // القيمة التي ستُرسل مع القرار (null = لم تُختر بعد)
  // v11 gate fix (J-04/K13): المسارات التي عدّلتها الإدارة يدويًا — مسوداتها لا تُستبدل عند تغيير النوع، بل يظهر تنبيه
  const touched = new Set();
  const touchedTone = new Map(); // نبرة المسودة التي بُني منها كل مسار عُدِّل يدويًا
  let draftTone = segNow; // نبرة المسودات المعروضة الآن (null = محايدة لطلب «غير محدد»)
  const toneWarnHost = h('div.pa-sheet-tonewarn', { 'aria-live': 'polite' });
  const headHost = h('div.pa-sheet-sendhead');
  const eligibilityHost = h('div.pa-sheet-eligibility');
  function drawSendHead() {
    // رأس الإرسال حين يكون النوع معروفًا (من الطلب أو من الاختيار هنا)
    mount(headHost, segPick ? sendHeader({ segment: segPick, tone: segPick === segNow ? p.tone || segPick : segPick, sendLine: p.send_line || null, requesterKind: opts.requesterKind || null }) : null);
  }
  function drawEligibility() {
    // r2 S14: قبول خيري بلا بيانات أسرة — تنبيه لا يمنع
    const show = Boolean(p.eligibility_warning) && segPick === 'charity' && (track === 'consultation' || track === 'matter');
    mount(eligibilityHost, show ? h('p.notice-warn', icon('alert', { size: 16 }), h('span', p.eligibility_text || 'لم تُسجَّل بيانات الأسرة — تأكدوا من الاستحقاق')) : null);
  }
  const segPicker = segmentChoice({
    value: segNow,
    required: segRequired,
    hint: segRequired ? opts.segmentHint || p.segment_hint || null : null,
    current: segNow,
    onChange: (v) => {
      segPick = v;
      drawSendHead();
      drawEligibility();
      syncFooter();
      swapDrafts(v);
    },
  });
  /**
   * P1 + v11 gate fix (J-04/K13): مسودات الرسائل بأسلوب النوع المختار (drafts_by_tone لكل طلب). المسارات التي لم تُلمس تُبنى
   * من جديد بالنبرة الجديدة؛ مسار عُدِّل يدويًا يبقى كما هو مع تنبيه، فلا يصل عميل «أفراد وشركات» نص خيري دون أن تنتبه الإدارة.
   */
  function swapDrafts(v) {
    const next = p.drafts_by_tone && p.drafts_by_tone[v];
    if (!next || v === draftTone) return syncToneWarn();
    p.drafts = next;
    draftTone = v;
    for (const t of [...forms.keys()]) if (!touched.has(t)) forms.delete(t);
    drawForm();
    syncToneWarn();
  }
  function syncToneWarn() {
    const stale = Boolean(segPick) && touched.has(track) && touchedTone.get(track) !== segPick;
    mount(toneWarnHost, stale ? h('p.notice-warn', icon('alert', { size: 16 }), h('span', `عدّلتم نص هذا النموذج فلم يُستبدل — راجعوا الرسالة لتكون ${segLabel('segment_tone', segPick)} قبل الإرسال.`)) : null);
  }

  const segBlock = segRequired
    ? h('div.pa-sheet-seg', segPicker)
    : h('details.pa-sheet-seg', h('summary', 'تغيير نوع الخدمة عند اعتماد القرار'), segPicker);

  // ───────────── أجزاء الورقة ─────────────
  const alertHost = h('div.pa-sheet-alert', { 'aria-live': 'assertive' });
  const formHost = h('div.pa-sheet-form');
  const why = h('p.pa-sheet-why');

  function drawWhy() {
    const reason = p.track && p.track.reason;
    why.hidden = !(track === recommended && reason);
    mount(why, why.hidden ? null : [h('strong', 'ليه؟ '), reason]);
  }

  const picker = choiceTiles({
    label: 'المسار',
    variant: 'chip',
    value: track,
    options: STORY_TRACKS.map((t) => ({
      value: t,
      label: label('story_track', t),
      icon: t === recommended ? 'sparkle' : null,
      hint: t === recommended ? 'مقترح' : null,
    })),
    onChange: (v) => {
      if (!v) return;
      track = v;
      mount(alertHost);
      drawWhy();
      drawForm();
      drawEligibility();
      syncToneWarn();
      syncFooter();
    },
    className: 'pa-sheet-tracks',
  });

  const warnings = p.warnings || [];
  const warnBox = warnings.length
    ? h('ul.pa-sheet-warnings', { 'aria-label': 'تنبيهات قبل القرار' }, warnings.map((w) => h('li', { class: `is-${w.code}` }, icon(w.code === 'local' ? 'info' : 'alert', { size: 15 }), h('span', w.text))))
    : null;

  // «اتصل بها» داخل الورقة حين يكون الهاتف هو الطريق إليها (رقم غير مؤكد أو رسائل صوتية فقط)
  const callFirst =
    p.actions && p.actions.primary === 'call'
      ? h(
          'div.pa-sheet-call',
          h('p', icon('phone', { size: 15 }), ' ', unconfirmed ? 'رقمها غير مؤكد ورسالة صفحتها غالبًا لن تُقرأ: الأفضل أن تكلّمها.' : 'كل رسائلها صوتية، والأفضل أن تكلّمها.'),
          asyncButton(
            addrForm === 'm' ? 'اتصل به' : 'اتصل بها',
            async () => {
              const r = await openCallNote({
                intake: { id: intakeId, code: p.code, phone: herPhone, unconfirmed, callIntro: p.actions.call_intro, form: addrForm },
                script: p.actions.call_script,
              });
              if (!r) return;
              finished = { called: r };
              handle.close('action');
            },
            { variant: 'primary', size: 'sm', icon: 'phone', className: 'pa-sheet-call-btn' },
          ),
        )
      : null;

  // ───────────── نماذج المسارات ─────────────
  const areaField = (required) => ({ name: 'legal_area', label: 'المجال القانوني', type: 'select', required, options: areaOptions() });
  const channelField = () => ({
    name: 'channel',
    label: 'قناة الرد',
    type: 'select',
    placeholder: false,
    options: replyChannels,
    hint: channelHint || null,
  });

  function issuesEditor(initial) {
    const items = (initial || []).map((x) => ({ ...x, checked: true }));
    const list = h('ol.pa-issues-list');
    const input = h('input.input', { type: 'text', maxlength: 300, placeholder: 'اكتب مسألة قانونية أخرى…', 'aria-label': 'مسألة جديدة' });
    const note = h('p.field-error', { hidden: true, role: 'alert' });
    function draw() {
      if (!items.length) {
        mount(list, h('li.pa-issue.is-empty', 'لا توجد مسائل بعد. أضف المسائل التي يحتاج الملف إلى دراستها.'));
        return;
      }
      mount(
        list,
        items.map((x, i) => {
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
            h(
              'span.pa-issue-meta',
              x.origin === 'ai'
                ? badge('اقتراح الذكاء الاصطناعي', 'accent', { icon: 'sparkle' })
                : [
                    badge('أضافتها الإدارة', 'primary'),
                    button('', {
                      variant: 'ghost',
                      size: 'sm',
                      icon: 'trash',
                      title: `حذف المسألة: ${x.title}`,
                      onClick: () => {
                        items.splice(i, 1);
                        draw();
                        input.focus();
                      },
                    }),
                  ],
            ),
          );
        }),
      );
    }
    function add() {
      const t = input.value.trim();
      note.hidden = true;
      if (t.length < 3) {
        note.textContent = 'اكتب عنوان المسألة (3 أحرف على الأقل)';
        note.hidden = false;
        input.focus();
        return;
      }
      if (items.some((x) => x.title === t)) {
        note.textContent = 'هذه المسألة موجودة بالفعل';
        note.hidden = false;
        return;
      }
      items.push({ title: t, details: null, legal_area: null, origin: 'staff', checked: true });
      input.value = '';
      draw();
      input.focus();
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        add();
      }
    });
    draw();
    return {
      el: h(
        'fieldset.pa-fieldset',
        h('legend', 'المسائل القانونية محل الدراسة'),
        h('p.field-hint', 'المسائل المقترحة محددة مسبقًا؛ ألغِ ما لا يلزم أو أضف غيرها.'),
        list,
        h('div.pa-issue-add', input, button('إضافة مسألة', { icon: 'plus', onClick: add })),
        note,
      ),
      get: () => items.filter((x) => x.checked).map((x) => ({ title: x.title, details: x.details || null, legal_area: x.legal_area || null, origin: x.origin === 'ai' ? 'ai' : 'staff' })),
    };
  }

  function replyBlock(reply, { checkbox, sourceLine: sourceLine0, withPicker } = {}) {
    let sourceLine = sourceLine0;
    const id = uid('sheet-reply');
    const ta = h('textarea.input.pa-sheet-reply', { id, rows: 6, maxlength: 4000, dir: 'auto' });
    ta.value = (reply && reply.text) || '';
    // مسودة فيها التحية والتوقيع فقط: تُكتب الرسالة بينهما قبل الإرسال
    const skeleton = isSkeletonReply(ta.value);
    if (skeleton && !sourceLine) sourceLine = 'لا توجد مسودة رد: اكتب الرد بين التحية والتوقيع، أو اختر ردًا جاهزًا.';
    const send = h('input', { type: 'checkbox', checked: !reply || reply.send !== false });
    const wrap = field(checkbox.textLabel, ta, { hint: sourceLine || null, full: true });
    const sync = () => {
      ta.disabled = !send.checked;
      wrap.classList.toggle('is-off', !send.checked);
    };
    send.addEventListener('change', () => {
      sync();
      syncFooter();
    });
    sync();
    const tools = withPicker ? h('div.pa-sheet-tools', quickReplyPicker({ context: { request_code: p.code, intake_id: intakeId }, onPick: (text) => insertAtCursor(ta, text) })) : null;
    return {
      el: h('div.pa-sheet-replybox', h('label.check', send, h('span', checkbox.label)), wrap, tools),
      get: () => ({ send: send.checked, text: ta.value.trim() }),
      /** خطأ قبل الإرسال: نص فارغ أو متغير لم يُملأ (مثل {client_name}) */
      check() {
        if (!send.checked) {
          wrap.setError('');
          return true;
        }
        const t = ta.value.trim();
        const v = unfilledVar(t);
        const msg = !t
          ? 'اكتب نص الرسالة أو ألغِ الإرسال'
          : v
            ? `الرسالة فيها متغير لم يُملأ: ${v} — اكتب بدلها الكلمة المناسبة`
            : skeleton && isSkeletonReply(t)
              ? 'الرسالة فيها التحية والتوقيع فقط — اكتب الرد بينهما أو ألغِ الإرسال'
              : '';
        wrap.setError(msg);
        if (msg) ta.focus();
        return !msg;
      },
      send,
      ta,
      wrap,
    };
  }

  function buildConsultation(matter = false) {
    const dc = (p.drafts && p.drafts[matter ? 'matter' : 'consultation']) || {};
    const c = dc.case || {};
    const staffOpts = (staff || []).map((s) => ({ value: s.id, label: `${s.name} — ${label('user_role', s.role)}` }));
    const main = form(
      [
        areaField(true),
        { name: 'title', label: 'عنوان الملف', required: true, maxLength: 200 },
        { name: 'priority', label: 'الأولوية', type: 'select', placeholder: false, options: options('priority') },
        !matter && { name: 'case_manager_id', label: 'مدير الحالة', type: 'select', options: staffOpts },
        !matter && { name: 'due_at', label: 'الموعد المستهدف للرد على المستفيد/ة', type: 'date', endOfDay: true, min: cairoToday() },
        {
          name: 'facts_shared',
          label: 'ملخص الوقائع للمحامين',
          type: 'textarea',
          rows: 5,
          maxLength: 20000,
          hint: 'هذا ما يمكن إتاحته للمحامين لاحقًا — راجعه وتأكد أنه بلا أرقام هواتف أو عناوين.',
        },
        !matter && {
          name: 'brief_draft',
          label: 'سؤال المحامي المقترح',
          type: 'textarea',
          rows: 3,
          maxLength: 5000,
          hint: 'يظهر تلقائيًا عند إسناد المحامي الأساسي، ويمكن تعديله وقتها.',
        },
        !matter && { name: 'facts_internal', label: 'ملاحظات داخلية (لا تظهر للمحامين)', type: 'textarea', rows: 3, maxLength: 20000 },
      ],
      {
        footer: false,
        values: {
          legal_area: c.legal_area || null,
          title: c.title || '',
          priority: c.priority || 'normal',
          case_manager_id: c.case_manager_id || opts.userId || null,
          facts_shared: c.facts_shared || '',
          brief_draft: c.brief_draft || '',
          facts_internal: c.facts_internal || '',
        },
      },
    );
    const issues = issuesEditor(c.issues);
    let matterForm = null;
    let lawyerSel = null;
    if (matter) {
      const md = dc.matter || {};
      matterForm = form(
        [
          { name: 'kind', label: 'نوع الملف', type: 'select', required: true, placeholder: false, options: options('matter_kind') },
          { name: 'court', label: 'المحكمة', maxLength: 200 },
          { name: 'opponent', label: 'الخصم', maxLength: 200, hint: 'يُفحص تعارض المصالح تلقائيًا' },
          { name: 'lawsuit_number', label: 'رقم الدعوى', ltr: true, maxLength: 40 },
          { name: 'lawsuit_year', label: 'السنة', type: 'number', integer: true, min: 1950, max: 2100 },
          { name: 'responsible_lawyer_id', label: 'المحامي المسؤول', type: 'select', options: [], hint: 'اختياري — يمكن اختياره لاحقًا من صفحة الملف المستمر' },
          { name: 'notes', label: 'ملاحظات وتكليف المحامي', type: 'textarea', rows: 4, maxLength: 5000 },
        ],
        { footer: false, values: { kind: md.kind || 'litigation', court: md.court || '', opponent: md.opponent || '', lawsuit_number: md.lawsuit_number || '', lawsuit_year: md.lawsuit_year || null, notes: md.notes || '' } },
      );
      lawyerSel = matterForm.control('responsible_lawyer_id');
      api
        .get('/admin/lawyers')
        .then((res) => {
          const items = (res.items || []).filter((l) => l.active && !l.invite_pending);
          const sel = lawyerSel.input;
          const cur = sel.value;
          for (const l of items) sel.append(h('option', { value: String(l.id) }, l.display_name || l.name));
          sel.value = cur;
        })
        .catch(() => {});
    }
    // بيانات المستفيدة والتمويل (لا تُقترح لرقم غير مؤكد: لا يُكتب فوق اسم صاحبة الرقم المسجلة)
    let clientForm = null;
    let program = null;
    if (!matter) {
      const cl = c.client || null;
      if (cl && !unconfirmed) {
        clientForm = form(
          [
            { name: 'name', label: 'اسم المستفيد/ة', maxLength: 150 },
            { name: 'national_id', label: 'الرقم القومي', ltr: true, maxLength: 14, hint: '14 رقمًا — اختياري' },
            { name: 'governorate', label: 'المحافظة', type: 'select', options: governorateOptions() },
          ],
          { footer: false, columns: 2, values: { name: cl.name || '', national_id: cl.national_id || '', governorate: cl.governorate || null } },
        );
      }
      program = programSelect({ area: c.legal_area || null, governorate: (cl && cl.governorate) || null });
      main.el.addEventListener('change', () => program.setContext({ area: main.getValues().legal_area }));
    }
    const reply = replyBlock(dc.reply, {
      checkbox: { label: 'إرسال رسالة للمستفيدة بأن طلبها اتسجّل', textLabel: 'نص الرسالة' },
      sourceLine: channelHint || null,
    });
    const el = frag(
      main.el,
      matter && h('p.pa-sheet-info', icon('info', { size: 15 }), h('span', 'سيُفتح ملف استشارة وملف مستمر مرتبط به في خطوة واحدة.')),
      matter && h('fieldset.pa-fieldset', h('legend', 'الملف المستمر'), matterForm.el),
      issues.el,
      !matter &&
        h(
          'details.pa-details.pa-sheet-more',
          h('summary', 'بيانات المستفيدة والتمويل'),
          clientForm ? clientForm.el : h('p.small.muted', unconfirmed ? 'رقمها غير مؤكد: لا تُعدَّل بيانات صاحبة الرقم المسجلة من هنا.' : 'لا توجد بيانات مستفيدة مرتبطة.'),
          program && program.el,
        ),
      reply.el,
    );
    return {
      el,
      reply,
      validate() {
        let ok = main.validate();
        if (!reply.check()) ok = false;
        if (clientForm && !clientForm.validate()) ok = false;
        if (matterForm && !matterForm.validate()) ok = false;
        if (clientForm) {
          const nid = toLatinDigits(clientForm.getValues().national_id || '').replace(/\s/g, '');
          if (nid && !/^[23]\d{13}$/.test(nid)) {
            clientForm.setErrors({ national_id: 'الرقم القومي يجب أن يتكون من 14 رقمًا ويبدأ بـ 2 أو 3' });
            ok = false;
          }
        }
        return ok;
      },
      showError(err) {
        main.showError(err);
      },
      payload() {
        const v = main.getValues();
        const kase = {
          legal_area: v.legal_area,
          title: v.title,
          priority: v.priority || undefined,
          facts_shared: v.facts_shared || undefined,
          issues: issues.get(),
        };
        if (!matter) {
          kase.brief_draft = v.brief_draft || undefined;
          kase.facts_internal = v.facts_internal || undefined;
          kase.case_manager_id = v.case_manager_id || undefined;
          kase.due_at = v.due_at || undefined;
          kase.program_id = program && program.get() ? program.get() : undefined;
          if (clientForm) {
            const cv = clientForm.getValues();
            const nid = toLatinDigits(cv.national_id || '').replace(/\s/g, '');
            kase.client = { name: cv.name || null, national_id: nid || null, governorate: cv.governorate || null };
          }
        } else {
          kase.brief_draft = c.brief_draft || undefined;
          kase.facts_internal = c.facts_internal || undefined;
          kase.case_manager_id = c.case_manager_id || opts.userId || undefined;
        }
        const out = { case: kase, reply: { ...reply.get(), channel: 'auto' } };
        if (matter) {
          const m = matterForm.getValues();
          out.matter = {
            kind: m.kind,
            court: m.court || null,
            opponent: m.opponent || null,
            lawsuit_number: m.lawsuit_number || null,
            lawsuit_year: m.lawsuit_year || null,
            responsible_lawyer_id: m.responsible_lawyer_id ? Number(m.responsible_lawyer_id) : null,
            notes: m.notes || null,
          };
        }
        return out;
      },
    };
  }

  function buildClose(kind) {
    const dr = (p.drafts && p.drafts[kind]) || {};
    const fields =
      kind === 'refer'
        ? [
            { name: 'referral_target', label: 'الجهة', required: true, maxLength: 200 },
            areaField(false),
            { name: 'resolution_note', label: 'ملخص ما تم (داخلي)', type: 'textarea', rows: 2, maxLength: 3000 },
            channelField(),
          ]
        : [
            areaField(false),
            { name: 'resolution_note', label: 'ملخص ما تم (داخلي)', type: 'textarea', required: true, rows: 2, maxLength: 3000, hint: 'يُحفظ داخليًا فقط.' },
            channelField(),
          ];
    const f = form(fields, {
      footer: false,
      values: {
        referral_target: dr.referral_target || '',
        legal_area: dr.legal_area || (p.drafts && p.drafts.consultation && p.drafts.consultation.case && p.drafts.consultation.case.legal_area) || null,
        resolution_note: dr.resolution_note || '',
        channel: opts.channel || 'auto',
      },
    });
    if (kind === 'refer') {
      // اقتراحات الجهات (دليل التوجيه في الإعدادات + مسودة الاقتراح)
      const listId = uid('ref-targets');
      const input = f.control('referral_target').input;
      input.setAttribute('list', listId);
      f.el.append(h('datalist', { id: listId }, [dr.referral_target].filter(Boolean).map((v) => h('option', { value: v }))));
    }
    const src = dr.reply && dr.reply.source;
    const sourceLine =
      src === 'quick_reply'
        ? `من الردود الجاهزة: ${dr.reply.source_title || ''}`
        : src === 'ai'
          ? 'مسودة من الذكاء الاصطناعي — راجعها قبل الإرسال'
          : src === 'referral_directory'
            ? 'من دليل التوجيه في الإعدادات — راجعها قبل الإرسال'
            : null;
    const reply = replyBlock(dr.reply, {
      checkbox: { label: kind === 'refer' ? 'إرسال الرسالة' : 'إرسال الرد', textLabel: kind === 'refer' ? 'رسالة التوجيه للمستفيدة' : 'الرد على المستفيدة' },
      sourceLine,
      withPicker: kind === 'internal',
    });
    return {
      el: frag(f.el, reply.el),
      reply,
      validate: ({ phone = false } = {}) => {
        const ok = f.validate();
        if (phone) {
          reply.wrap.setError('');
          return ok;
        }
        return reply.check() && ok;
      },
      showError: (err) => f.showError(err),
      payload() {
        const v = f.getValues();
        const out = {
          legal_area: v.legal_area || undefined,
          resolution_note: v.resolution_note || undefined,
          reply: { ...reply.get(), channel: v.channel || 'auto' },
        };
        if (kind === 'refer') out.referral_target = v.referral_target;
        return out;
      },
      replyText: () => reply.get().text,
    };
  }

  function buildNeedInfo() {
    const dr = (p.drafts && p.drafts.need_info) || {};
    const qs = (dr.questions || []).slice(0, 3).map((q) => ({ text: q }));
    if (!qs.length) qs.push({ text: '' });
    const initialText = (dr.reply && dr.reply.text) || '';
    const parts = splitQuestions(initialText, (dr.questions || []).slice(0, 3));
    let edited = false;
    const list = h('ol.pa-sheet-questions');
    const addBtn = button('إضافة سؤال', { size: 'sm', icon: 'plus', onClick: () => addQ() });
    const msgId = uid('sheet-msg');
    const msg = h('textarea.input.pa-sheet-reply', { id: msgId, rows: 7, maxlength: 4000, dir: 'auto' });
    const resetLink = button('رجّعها للنص التلقائي', {
      variant: 'link',
      size: 'sm',
      onClick: () => {
        edited = false;
        rebuild();
        resetLink.hidden = true;
      },
    });
    resetLink.hidden = true;
    const msgWrap = field('الرسالة كما ستصلها', msg, { full: true, hint: channelHint || null });
    msg.addEventListener('input', () => {
      edited = true;
      resetLink.hidden = false;
    });
    const f = form([channelField()], { footer: false, values: { channel: opts.channel || 'auto' } });
    const err = h('p.field-error', { role: 'alert', hidden: true });

    function numbered() {
      return qs
        .map((q) => q.text.trim())
        .filter(Boolean)
        .map((q, k) => `${k + 1}. ${q}`)
        .join('\n');
    }
    function rebuild() {
      if (edited) return;
      msg.value = parts ? `${parts.before}${numbered()}${parts.after}` : numbered();
    }
    function addQ() {
      if (qs.length >= 3) return;
      qs.push({ text: '' });
      draw();
      list.querySelectorAll('input')[qs.length - 1]?.focus();
    }
    function draw() {
      mount(
        list,
        qs.map((q, i) => {
          const input = h('input.input', { type: 'text', maxlength: 300, value: q.text, dir: 'auto', 'aria-label': `السؤال ${i + 1}` });
          input.addEventListener('input', () => {
            q.text = input.value;
            rebuild();
          });
          return h(
            'li.pa-sheet-q',
            input,
            qs.length > 1 &&
              button('', {
                variant: 'ghost',
                size: 'sm',
                icon: 'trash',
                title: `حذف السؤال ${i + 1}`,
                onClick: () => {
                  qs.splice(i, 1);
                  draw();
                  rebuild();
                },
              }),
          );
        }),
      );
      addBtn.disabled = qs.length >= 3;
    }
    draw();
    msg.value = initialText;
    return {
      el: frag(
        h('p.pa-sheet-info', icon('info', { size: 15 }), h('span', 'سيصبح الطلب "بانتظار المستفيد/ة"، وعندما ترد يُعاد التلخيص تلقائيًا.')),
        h('fieldset.pa-fieldset', h('legend', 'الأسئلة (من 1 إلى 3)'), list, addBtn, err),
        msgWrap,
        resetLink,
        f.el,
      ),
      validate() {
        const filled = qs.map((q) => q.text.trim()).filter(Boolean);
        if (!filled.length) {
          err.textContent = 'اكتب سؤالًا واحدًا على الأقل';
          err.hidden = false;
          list.querySelector('input')?.focus();
          return false;
        }
        err.hidden = true;
        const v = unfilledVar(msg.value);
        if (!msg.value.trim() || v) {
          msgWrap.setError(v ? `الرسالة فيها متغير لم يُملأ: ${v} — اكتب بدلها الكلمة المناسبة` : 'نص الرسالة فارغ');
          msg.focus();
          return false;
        }
        msgWrap.setError('');
        return f.validate();
      },
      showError: (e) => f.showError(e),
      payload() {
        return { questions: qs.map((q) => q.text.trim()).filter(Boolean), reply: { send: true, text: msg.value.trim(), channel: f.getValues().channel || 'auto' } };
      },
    };
  }

  function current() {
    if (!forms.has(track)) {
      const built =
        track === 'consultation' ? buildConsultation(false) : track === 'matter' ? buildConsultation(true) : track === 'need_info' ? buildNeedInfo() : buildClose(track);
      built.host = h('div.pa-sheet-track', { dataset: { track } }, built.el);
      forms.set(track, built);
    }
    return forms.get(track);
  }

  function drawForm() {
    mount(formHost, current().host);
  }

  // ───────────── الإرسال ─────────────
  async function submit(extra = {}) {
    const cur = current();
    const body = {
      track,
      story_rev: rev.value,
      suggestion_id: p.suggestion_id || undefined,
      ...cur.payload(),
      ...extra,
    };
    // v11 segment-staff: النوع المختار (إلزامي لطلب «غير محدد»؛ ومخالفته لنوع الطلب تُسجَّل تغييرًا)
    if (segPick && segPick !== segNow) body.segment = segPick;
    try {
      const res = await api.post(`${base}/accept`, body);
      finished = res;
      handle.close('action');
      return true;
    } catch (err) {
      if (err && err.status === 409 && (err.code === 'story_changed' || /سبق إرسال أسئلة/.test(err.message || ''))) {
        const changed = err.code === 'story_changed';
        const forceBtn = asyncButton(
          'متابعة رغم ذلك',
          async () => {
            footerBusy(true);
            try {
              await submit({ ...extra, force: true });
            } finally {
              footerBusy(false);
            }
          },
          { variant: 'primary', size: 'sm', className: 'pa-sheet-force' },
        );
        mount(
          alertHost,
          alertBox(
            h(
              'div.stack-sm',
              h('p', changed ? 'وصلت رسائل جديدة من المستفيدة بعد فتح الاقتراح. راجعها ثم حاول مرة أخرى، أو تابع رغم ذلك.' : 'سبق إرسال أسئلة لم تُجب بعد'),
              h(
                'div.btn-group',
                changed &&
                  button('مراجعة الرسائل', {
                    size: 'sm',
                    icon: 'message',
                    onClick: () => {
                      finished = { review: true };
                      handle.close('action');
                    },
                  }),
                forceBtn,
              ),
            ),
            'warning',
            { title: changed ? 'القصة تغيّرت' : 'الطلب بانتظار ردها' },
          ),
        );
        alertHost.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        forceBtn.focus();
        return false;
      }
      if (err && err.status === 409) {
        if (err.code === 'segment_required') segPicker.setError(REQUIRED_TEXT);
        mount(alertHost, alertBox(errorMessage(err), 'danger'));
        return false;
      }
      if (err && (err.status === 400 || err.status === 422)) {
        cur.showError(err);
        mount(alertHost, alertBox(errorMessage(err), 'danger'));
        return false;
      }
      throw err;
    }
  }

  async function deliverByPhone() {
    const cur = current();
    mount(alertHost);
    if (!segPick) {
      segPicker.setError(REQUIRED_TEXT);
      return false;
    }
    if (!cur.validate({ phone: true })) return false;
    let noteId = opts.callNoteId || null;
    if (!noteId) {
      const r = await openCallNote({
        intake: { id: intakeId, code: p.code, phone: herPhone, unconfirmed, callIntro: p.actions && p.actions.call_intro, form: addrForm },
        script: cur.replyText ? cur.replyText() : null,
      });
      if (!r) return false;
      noteId = r.message_id;
      if (r.story && r.story.rev != null) rev.value = Number(r.story.rev) || rev.value;
    }
    return submit({ deliver: 'phone', call_note_id: noteId });
  }

  // ───────────── الورقة ─────────────
  const subtitle = [p.code, opts.name].filter(Boolean).join(' — ');
  // (modal يعيد تفعيل الأزرار حسب disabled في هذه المصفوفة بعد كل ضغطة — فيبقى الإرسال معطلًا حتى يُختار النوع)
  const sheetActions = [
    { label: 'إلغاء', variant: 'ghost' },
    { label: PHONE_DELIVERY, variant: 'link', icon: 'phone', onClick: () => deliverByPhone(), disabled: !segPick },
    {
      label: SUBMIT_LABELS[track],
      variant: 'primary',
      icon: SUBMIT_ICONS[track],
      disabled: !segPick,
      onClick: async () => {
        mount(alertHost);
        if (!segPick) {
          segPicker.setError(REQUIRED_TEXT);
          return false;
        }
        if (!current().validate()) return false;
        return (await submit()) ? undefined : false;
      },
    },
  ];
  handle = modal({
    sheet: true,
    className: 'pa-story-sheet',
    title: 'اعمله طلب',
    subtitle,
    body: frag(
      // v11 segment-staff (r2 P13): النوع والنبرة و«سيُرسل من» أعلى الورقة متى عُرف النوع
      headHost,
      segBlock,
      p.one_line && h('p.pa-sheet-oneline', { dir: 'auto' }, icon('sparkle', { size: 14 }), h('span', p.one_line)),
      picker,
      why,
      callFirst,
      warnBox,
      eligibilityHost,
      alertHost,
      toneWarnHost,
      formHost,
    ),
    actions: sheetActions,
    onClose: () => {
      if (!finished) return;
      if (finished.review) {
        if (opts.onReview) opts.onReview();
        else window.location.hash = `#/inbox/${intakeId}?focus=chat`;
        return;
      }
      if (finished.called) {
        if (opts.onCalled) opts.onCalled(finished.called);
        else if (opts.onDone) opts.onDone({ next: `#/inbox/${intakeId}` });
        return;
      }
      acceptToast(finished);
      if (opts.onDone) opts.onDone(finished);
      else if (finished.next) window.location.hash = finished.next;
    },
  });
  const [cancelBtn, phoneBtn, submitBtn] = handle.buttons;
  phoneBtn.classList.add('pa-sheet-phone');
  submitBtn.classList.add('pa-sheet-submit');
  cancelBtn.classList.add('pa-sheet-cancel');

  function footerBusy(on) {
    for (const b of handle.buttons) b.disabled = on;
  }

  function syncFooter() {
    // v11 segment-staff: لا إرسال قبل اختيار نوع الخدمة
    sheetActions[1].disabled = !segPick;
    sheetActions[2].disabled = !segPick;
    phoneBtn.disabled = !segPick;
    submitBtn.disabled = !segPick;
    submitBtn.title = segPick ? '' : REQUIRED_TEXT;
    phoneBtn.hidden = !(track === 'internal' || track === 'refer');
    let text = SUBMIT_LABELS[track];
    if (track === 'internal' || track === 'refer') {
      const cur = current();
      if (cur.reply && !cur.reply.get().send) text = 'إغلاق الطلب دون رسالة';
    }
    const lbl = submitBtn.querySelector('.btn-label');
    if (lbl) lbl.textContent = text;
    const ic = submitBtn.querySelector('svg.icon');
    if (ic) ic.replaceWith(icon(SUBMIT_ICONS[track], { size: 18 }));
  }

  drawWhy();
  drawForm();
  drawSendHead();
  drawEligibility();
  syncFooter();
  // تعديل يدوي في نموذج مسار يمنع إعادة تعبئة مسوداته عند تغيير النوع (v11 gate fix J-04: لكل مسار على حدة)
  formHost.addEventListener('input', () => {
    if (!touched.has(track)) touchedTone.set(track, draftTone);
    touched.add(track);
  });
  if (opts.focusTracks) requestAnimationFrame(() => picker.focusFirst && picker.focusFirst());
  return handle;
}
