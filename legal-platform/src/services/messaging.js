// قنوات العملاء (الإصدار 9 — وحدة messaging):
// • الردود الجاهزة للإدارة بمتغيرات واختصارات وعداد استخدام.
// • قوالب واتساب المعتمدة: مزامنتها من حساب واتساب للأعمال وربطها بالأغراض (تحديث الملف، رمز الدخول، الاستبيان، قواعد الأتمتة).
// • إعلام العميل بقراءة رسائله، وإرسال المستندات له (واتساب داخل النافذة أو بوابة العملاء).
// • دخول بوابة العملاء برمز يصل عبر واتساب دون كشف وجود الرقم.
// • استبيان رضا العملاء بعد الرد: إرساله والتقاط التقييم والتنبيه بالتقييم المنخفض والتحليلات.
import crypto from 'node:crypto';
import {
  nowIso, addHours, addDays, parseJson, badRequest, notFound, conflict, ApiError, v, sha256, randomToken, latinDigits,
  normalizeArabic, maskPhone, truncate, periodOf, arabicPeriod, arabicCount, isValidPeriod, periodRange,
} from '../util.js';
import { LABELS, ENUMS, LEGAL_AREAS } from '../constants.js';
import { RateLimiter } from '../auth.js';
import { countTemplateParams, graphErrorArabic } from '../channels/whatsapp.js';
import { mapMessage } from '../channels/engine.js';

const AREA = Object.fromEntries(LEGAL_AREAS.map((a) => [a.code, a.label]));

// مسميات أحداث سجل الأمان الخاصة بهذه الوحدة تُضاف إلى مجموعة security_event (لصفحة سجل الأمان) دون تعديل كتلة وحدة الحسابات
if (LABELS.security_event && LABELS.messaging_security_event) {
  for (const [k, val] of Object.entries(LABELS.messaging_security_event)) if (!LABELS.security_event[k]) LABELS.security_event[k] = val;
}

// ===== الردود الجاهزة =====
const QR_VARS = Object.keys(LABELS.quick_reply_variable);
const SHORTCUT_RE = /^\/[\p{L}\p{N}_-]{2,30}$/u;

// ===== أغراض القوالب والمتغيرات المسموح بها لكل غرض =====
export const TEMPLATE_PURPOSES = {
  case_update: ['body', 'client_name', 'org_name', 'case_code', 'matter_code', 'request_code'],
  otp: ['code', 'org_name'],
  survey: ['client_name', 'case_code', 'org_name', 'body'],
  'rule:hearing_reminder': ['body', 'client_name', 'org_name', 'event_kind', 'matter_code', 'date', 'time', 'location', 'title'],
  'rule:invoice_reminder': ['body', 'client_name', 'org_name', 'invoice_number', 'amount', 'due_date'],
  'rule:document_reminder': ['body', 'client_name', 'org_name', 'case_code', 'request'],
};

// ===== دخول البوابة برمز =====
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_COOLDOWN_SECONDS = 60;
const SECONDS = ['ثانية', 'ثانيتين', 'ثوانٍ', 'ثانية'];
// «بعد محاولتين فاشلتين» (مجرور) و«يتبقى لك محاولتان» (مرفوع: فاعل)
const ATTEMPTS = ['محاولة واحدة', 'محاولتين', 'محاولات', 'محاولة'];
const ATTEMPTS_LEFT = ['محاولة واحدة', 'محاولتان', 'محاولات', 'محاولة'];
const TEMPLATES_UNIT = ['قالب واحد', 'قالبان', 'قوالب', 'قالبًا'];

// ===== الاستبيان =====
const SURVEY_BUTTONS = [
  { rating: 5, title: 'ممتاز' },
  { rating: 3, title: 'جيد' },
  { rating: 1, title: 'غير راضٍ' },
];
const COMMENT_WINDOW_HOURS = 24;

/** التقييم من نص زر أو كلمة: ممتاز / جيد جدًا / جيد / مقبول / غير راضٍ */
export function ratingFromWords(text) {
  const t = normalizeArabic(String(text || ''))
    .replace(/[.!؟?،,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t.length > 20) return null;
  if (t === 'ممتاز' || t === 'ممتازه') return 5;
  if (t === 'جيد جدا') return 4;
  if (t === 'جيد') return 3;
  if (t === 'مقبول') return 2;
  if (/^(غير راض(ي|يه)?|مش راض(ي|يه)?|سيء|سيئ|سييء)$/.test(t)) return 1;
  return null;
}

/** رد رقمي على الاستبيان: «4» أو «٤» أو «2 - الرد تأخر» ← { rating, comment } */
export function ratingFromDigits(text) {
  const s = latinDigits(String(text || '')).trim();
  const m = /^([1-5])(?:\s*(?:[-–—:.,،)]|\/5|من\s*5)?\s*([\s\S]*))?$/u.exec(s);
  if (!m) return null;
  const rest = (m[2] || '').trim();
  // «3 ورثة» ليس تقييمًا غالبًا إن تبعه نص طويل بلا فاصل؛ نقبل التعليق فقط بعد فاصل أو مسافة مع نص معقول
  if (rest && /^\d/.test(rest)) return null;
  return { rating: Number(m[1]), comment: rest ? rest.slice(0, 2000) : null };
}

export function fillVars(template, values) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (values[k] !== undefined && values[k] !== null && values[k] !== '' ? String(values[k]) : m));
}

export function createMessaging(app) {
  const { db } = app;
  const orgName = () => app.settings.get('org_name') || 'بيوت مصر';

  // مفتاح تجزئة رموز الدخول: من APP_SECRET إن ضُبط، وإلا مفتاح عشوائي لعمر العملية (الرمز صالح 10 دقائق فقط)
  const otpKey = process.env.APP_SECRET && String(process.env.APP_SECRET).length >= 16
    ? crypto.createHash('sha256').update(`portal-otp:${process.env.APP_SECRET}`).digest()
    : crypto.randomBytes(32);
  const otpHash = (challengeHash, code) => crypto.createHmac('sha256', otpKey).update(`${challengeHash}:${code}`).digest('hex');

  /**
   * هل الدخول برمز واتساب متاح فعلًا؟ مفعّل من الإعدادات، والرمز يمكن أن يصل: واتساب حقيقي متصل،
   * أو وضع المحاكاة خارج الإنتاج / في النسخة التجريبية (يظهر الرمز في صندوق الصادر للتجربة).
   * في الإنتاج بلا واتساب لا يُعرض على العميل وعد برمز لن يصل، ولا يُحفظ أي رمز مقروءًا في قاعدة البيانات.
   */
  function portalOtpAvailable() {
    if (!app.settings.get('portal_otp_enabled')) return false;
    return !!app.whatsapp.configured || !app.config?.production || !!app.config?.demo;
  }

  /** حد التقييم المنخفض (1–4): قيمة خارج المدى من الإعدادات لا تجعل كل تقييم «منخفضًا» ولا تلغي التنبيه */
  function lowThreshold() {
    const n = Math.round(Number(app.settings.get('survey_low_rating_threshold')));
    return Number.isFinite(n) && n >= 1 ? Math.min(4, n) : 2;
  }

  const limiters = {
    requestIp: new RateLimiter({ windowMs: 60 * 60 * 1000, max: 10 }),
    requestPhone: new RateLimiter({ windowMs: 60 * 60 * 1000, max: 5 }),
    verifyIp: new RateLimiter({ windowMs: 60 * 60 * 1000, max: 30 }),
  };

  // ===================== أدوات مشتركة =====================
  function clientName(clientId) {
    return clientId ? db.value('SELECT name FROM clients WHERE id = ?', clientId) ?? null : null;
  }

  /** قيم المتغيرات المعروفة لرسالة صادرة (للقوالب) */
  function baseVars(msg) {
    const out = { body: msg.body, org_name: orgName() };
    if (msg.client_id) {
      const c = app.clients.get(msg.client_id);
      if (c?.name) out.client_name = c.name;
    }
    if (msg.case_id) out.case_code = db.value('SELECT code FROM cases WHERE id = ?', msg.case_id) ?? undefined;
    if (msg.matter_id) out.matter_code = db.value('SELECT code FROM matters WHERE id = ?', msg.matter_id) ?? undefined;
    if (msg.intake_id) out.request_code = db.value('SELECT code FROM intakes WHERE id = ?', msg.intake_id) ?? undefined;
    return out;
  }

  function templateRow(name, language) {
    return db.get('SELECT * FROM wa_templates WHERE name = ? AND language = ?', name, language);
  }
  function mapTemplate(t) {
    if (!t) return null;
    return {
      id: t.id,
      name: t.name,
      language: t.language,
      category: t.category,
      category_label: LABELS.wa_template_category[t.category] || t.category,
      status: t.status,
      status_label: LABELS.wa_template_status[t.status] || t.status,
      header_text: t.header_text,
      body_text: t.body_text,
      footer_text: t.footer_text,
      param_count: t.param_count,
      header_param_count: t.header_param_count,
      buttons: parseJson(t.buttons, []),
      rejected_reason: t.rejected_reason,
      synced_at: t.synced_at,
      removed: !!t.removed_at,
      usable: t.status === 'APPROVED' && !t.removed_at && !t.header_param_count,
    };
  }

  /** حالة ربط غرض بقالب */
  function mappingState(m, tpl) {
    if (!m) return 'unmapped';
    if (!tpl || tpl.removed_at) return 'missing';
    if (tpl.status !== 'APPROVED') return 'not_approved';
    if (tpl.param_count !== parseJson(m.params, []).length) return 'param_mismatch';
    return 'ok';
  }

  /** حل أفضل ربط صالح لقائمة أغراض بالترتيب */
  function resolveMapping(purposes) {
    for (const purpose of purposes) {
      const m = db.get('SELECT * FROM wa_template_mappings WHERE purpose = ?', purpose);
      if (!m) continue;
      const tpl = templateRow(m.template_name, m.language);
      if (mappingState(m, tpl) === 'ok') return { purpose, mapping: m, template: tpl };
    }
    return null;
  }

  // ===================== قراءة الرسائل (Read receipts) =====================
  const readQueue = new Map();
  let flushing = null;

  async function flushReadReceipts() {
    if (flushing) return flushing;
    flushing = (async () => {
      let done = 0;
      try {
        for (const [id, row] of [...readQueue]) {
          readQueue.delete(id);
          if (!app.whatsapp.configured) continue;
          try {
            await app.whatsapp.markRead(row.external_id);
            db.run(
              "UPDATE messages SET read_receipt_at = ? WHERE client_id = ? AND direction = 'in' AND channel = 'whatsapp' AND id <= ? AND read_receipt_at IS NULL",
              nowIso(),
              row.client_id,
              row.id,
            );
            done++;
          } catch (e) {
            // أفضل جهد: يُعاد المحاولة عند فتح المحادثة التالية
            app.log(`whatsapp read receipt ${row.external_id} failed`, e?.arabic || e);
          }
        }
      } finally {
        flushing = null;
      }
      return done;
    })();
    return flushing;
  }

  // ===================== رموز الدخول =====================
  /** العميل صاحب الرقم إن كان الرقم هوية موثّقة: أثبتها واتساب أو سجلتها/أكدتها الإدارة (وليس مجرد إدخال في نموذج الموقع) */
  function verifiedClientForPhone(phone) {
    const ident = db.get("SELECT * FROM client_identities WHERE kind = 'phone' AND value = ?", phone);
    if (!ident) return null;
    const client = app.clients.get(ident.client_id);
    if (!client) return null;
    const chans = parseJson(ident.channels, []);
    // [] = أضافتها الإدارة يدويًا؛ واتساب يثبت الملكية؛ المكالمة والحضور الشخصي سجلتهما الإدارة
    if (!chans.length || chans.some((c) => c !== 'website')) return client;
    const confirmed = db.get(
      "SELECT 1 FROM intakes WHERE client_id = ? AND contact_phone = ? AND json_extract(source_detail, '$.identity_confirmed_at') IS NOT NULL",
      client.id,
      phone,
    );
    return confirmed ? client : null;
  }

  function rateLimited(ctx, type, phone) {
    app.audit?.log({
      ctx,
      actor: { kind: 'client' },
      type: 'portal.otp_rate_limited',
      severity: 'warning',
      summary: `تجاوز حد ${type === 'verify' ? 'محاولات إدخال' : 'طلبات'} رمز دخول بوابة العملاء${phone ? ` للرقم ${maskPhone(phone)}` : ''}`,
      data: { kind: type, phone: phone ? maskPhone(phone) : null },
    });
  }

  const svc = {
    TEMPLATE_PURPOSES,

    // ───────────── الردود الجاهزة ─────────────
    listQuickReplies({ q, category } = {}) {
      const where = ['1=1'];
      const params = [];
      if (category && ENUMS.quick_reply_category.includes(category)) {
        where.push('r.category = ?');
        params.push(category);
      }
      let rows = db.all(
        `SELECT r.*, u.name AS updated_by_name FROM quick_replies r LEFT JOIN users u ON u.id = COALESCE(r.updated_by, r.created_by)
         WHERE ${where.join(' AND ')} ORDER BY r.usage_count DESC, r.title`,
        ...params,
      );
      if (q && String(q).trim()) {
        const needle = normalizeArabic(String(q).trim());
        rows = rows.filter((r) => [r.title, r.shortcut, r.body].some((x) => normalizeArabic(x || '').includes(needle)));
      }
      return {
        items: rows.map((r) => svc.mapQuickReply(r)),
        total: Number(db.value('SELECT COUNT(*) FROM quick_replies')),
        variables: LABELS.quick_reply_variable,
      };
    },

    mapQuickReply(r) {
      return {
        id: r.id,
        title: r.title,
        shortcut: r.shortcut,
        category: r.category,
        category_label: LABELS.quick_reply_category[r.category] || r.category,
        body: r.body,
        variables: [...new Set([...String(r.body).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))],
        usage_count: r.usage_count,
        last_used_at: r.last_used_at,
        updated_by_name: r.updated_by_name || null,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    },

    requireQuickReply(id) {
      const r = db.get('SELECT * FROM quick_replies WHERE id = ?', id);
      if (!r) throw notFound('الرد الجاهز غير موجود');
      return r;
    },

    validateQuickReply(body, current = null) {
      const out = {};
      if (!current || body.title !== undefined) out.title = v.str(body.title, 'عنوان الرد', { required: true, max: 120 });
      if (!current || body.body !== undefined) {
        out.body = v.str(body.body, 'نص الرد', { required: true, max: 4000 });
        const unknown = [...new Set([...out.body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => !QR_VARS.includes(k)))];
        if (unknown.length) {
          throw badRequest(`متغير غير معروف في النص: ${unknown.map((k) => `{${k}}`).join('، ')}. المتغيرات المتاحة: ${QR_VARS.map((k) => `{${k}}`).join('، ')}`);
        }
      }
      if (!current || body.category !== undefined) out.category = v.oneOf(body.category || 'general', ENUMS.quick_reply_category, 'التصنيف', { required: true });
      if (!current || body.shortcut !== undefined) {
        let s = v.str(body.shortcut, 'الاختصار', { max: 31 });
        if (s) {
          s = latinDigits(s).replace(/\s+/g, '').toLowerCase();
          if (!s.startsWith('/')) s = `/${s}`;
          if (!SHORTCUT_RE.test(s)) throw badRequest('الاختصار يبدأ بـ «/» ويتكون من حرفين إلى 30 حرفًا أو رقمًا دون مسافات، مثل /وثائق');
          const dup = db.get('SELECT id FROM quick_replies WHERE shortcut = ? AND id != ?', s, current?.id ?? 0);
          if (dup) throw conflict(`الاختصار ${s} مستخدم في رد جاهز آخر`);
        }
        out.shortcut = s || null;
      }
      return out;
    },

    createQuickReply(body, actor) {
      const data = svc.validateQuickReply(body || {});
      const t = nowIso();
      const id = db.insert('quick_replies', { ...data, created_by: actor?.id ?? null, updated_by: actor?.id ?? null, created_at: t, updated_at: t });
      return svc.mapQuickReply(db.get('SELECT * FROM quick_replies WHERE id = ?', id));
    },

    updateQuickReply(id, body, actor) {
      const cur = svc.requireQuickReply(id);
      const data = svc.validateQuickReply(body || {}, cur);
      if (!Object.keys(data).length) throw badRequest('لا توجد تعديلات');
      db.update('quick_replies', cur.id, { ...data, updated_by: actor?.id ?? null, updated_at: nowIso() });
      return svc.mapQuickReply(db.get('SELECT * FROM quick_replies WHERE id = ?', cur.id));
    },

    deleteQuickReply(id) {
      const cur = svc.requireQuickReply(id);
      db.run('DELETE FROM quick_replies WHERE id = ?', cur.id);
      return { ok: true };
    },

    /** قيم المتغيرات من سياق المحادثة (ملف / طلب / عميل) مع ما ترسله الواجهة */
    contextValues({ context = {}, case_id, intake_id, client_id } = {}) {
      const out = { org_name: orgName() };
      const ctx = context && typeof context === 'object' ? context : {};
      for (const k of ['client_name', 'case_code', 'request_code']) {
        if (typeof ctx[k] === 'string' && ctx[k].trim()) out[k] = ctx[k].trim().slice(0, 200);
      }
      const caseId = v.int(case_id, 'الملف', { min: 1 });
      const intakeId = v.int(intake_id, 'الطلب', { min: 1 });
      let cid = v.int(client_id, 'العميل', { min: 1 });
      if (caseId) {
        const c = db.get('SELECT code, client_id, intake_id FROM cases WHERE id = ?', caseId);
        if (c) {
          out.case_code = c.code;
          cid = cid || c.client_id;
          if (c.intake_id && !out.request_code) out.request_code = db.value('SELECT code FROM intakes WHERE id = ?', c.intake_id) ?? undefined;
        }
      }
      if (intakeId) {
        const i = db.get('SELECT code, client_id, contact_name, case_id FROM intakes WHERE id = ?', intakeId);
        if (i) {
          out.request_code = i.code;
          cid = cid || i.client_id;
          if (!out.client_name && i.contact_name) out.client_name = i.contact_name;
          if (i.case_id && !out.case_code) out.case_code = db.value('SELECT code FROM cases WHERE id = ?', i.case_id) ?? undefined;
        }
      }
      if (cid && !out.client_name) {
        const n = clientName(cid);
        if (n) out.client_name = n;
      }
      return out;
    },

    /** استخدام رد جاهز: يملأ المتغيرات ويزيد عداد الاستخدام */
    useQuickReply(id, body = {}) {
      const r = svc.requireQuickReply(id);
      const values = svc.contextValues(body);
      const text = fillVars(r.body, values);
      const missing = [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => QR_VARS.includes(k)))];
      db.run('UPDATE quick_replies SET usage_count = usage_count + 1, last_used_at = ? WHERE id = ?', nowIso(), r.id);
      return { id: r.id, title: r.title, text, missing, usage_count: r.usage_count + 1 };
    },

    // ───────────── قوالب واتساب ─────────────
    templatesOverview() {
      const templates = db.all('SELECT * FROM wa_templates ORDER BY removed_at IS NOT NULL, status != \'APPROVED\', name, language').map(mapTemplate);
      const eff = app.whatsapp.effective ? app.whatsapp.effective() : {};
      return {
        configured: !!app.whatsapp.configured,
        waba_set: !!eff.wabaId,
        last_synced_at: db.value('SELECT MAX(synced_at) FROM wa_templates') ?? null,
        legacy_template: app.settings.get('whatsapp_template_name') || null,
        // حالة الدخول برمز واتساب على /portal: مفعّل من الإعدادات؟ ومتاح فعلًا (واتساب متصل، أو محاكاة خارج الإنتاج)؟
        portal_otp: { enabled: !!app.settings.get('portal_otp_enabled'), available: portalOtpAvailable(), simulation: !app.whatsapp.configured },
        templates,
        mappings: svc.mappings(),
        purposes: LABELS.wa_template_purpose,
        variables: LABELS.wa_template_variable,
      };
    },

    mappings() {
      return Object.keys(TEMPLATE_PURPOSES).map((purpose) => {
        const m = db.get('SELECT * FROM wa_template_mappings WHERE purpose = ?', purpose);
        const tpl = m ? templateRow(m.template_name, m.language) : null;
        return {
          purpose,
          label: LABELS.wa_template_purpose[purpose] || purpose,
          variables: TEMPLATE_PURPOSES[purpose],
          mapping: m ? { template_name: m.template_name, language: m.language, params: parseJson(m.params, []), updated_at: m.updated_at } : null,
          template: mapTemplate(tpl),
          state: mappingState(m, tpl),
        };
      });
    },

    /** مزامنة القوالب من حساب واتساب للأعمال (GET /{waba_id}/message_templates) */
    async syncTemplates(actor, ctx = null) {
      if (!app.whatsapp.configured) {
        throw conflict('اضبط بيانات واتساب للأعمال أولًا (رمز الوصول ومعرّف الرقم ومعرّف حساب واتساب للأعمال WABA) من صفحة التكاملات.');
      }
      let list;
      try {
        list = await app.whatsapp.listTemplates();
      } catch (e) {
        throw new ApiError(502, e.arabic || graphErrorArabic(e), 'whatsapp_error');
      }
      const t = nowIso();
      let approved = 0;
      let removed = 0;
      const seen = new Set();
      db.tx(() => {
        for (const tpl of list) {
          if (!tpl || !tpl.name || !tpl.language) continue;
          seen.add(`${String(tpl.name).slice(0, 512)}|${String(tpl.language).slice(0, 20)}`);
          const comps = Array.isArray(tpl.components) ? tpl.components : [];
          const find = (type) => comps.find((c) => String(c.type).toUpperCase() === type);
          const header = find('HEADER');
          const bodyC = find('BODY');
          const footer = find('FOOTER');
          const btns = find('BUTTONS');
          const headerText = header && String(header.format || 'TEXT').toUpperCase() === 'TEXT' ? header.text || null : header ? `[${String(header.format).toLowerCase()}]` : null;
          const status = String(tpl.status || 'PENDING').toUpperCase();
          if (status === 'APPROVED') approved++;
          db.run(
            `INSERT INTO wa_templates (external_id, name, language, category, status, header_text, body_text, footer_text, param_count, header_param_count, buttons, rejected_reason, synced_at, removed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
             ON CONFLICT(name, language) DO UPDATE SET external_id = excluded.external_id, category = excluded.category, status = excluded.status,
               header_text = excluded.header_text, body_text = excluded.body_text, footer_text = excluded.footer_text, param_count = excluded.param_count,
               header_param_count = excluded.header_param_count, buttons = excluded.buttons, rejected_reason = excluded.rejected_reason,
               synced_at = excluded.synced_at, removed_at = NULL`,
            tpl.id ? String(tpl.id) : null,
            String(tpl.name).slice(0, 512),
            String(tpl.language).slice(0, 20),
            tpl.category ? String(tpl.category).toUpperCase() : null,
            status,
            headerText,
            bodyC?.text || null,
            footer?.text || null,
            countTemplateParams(bodyC?.text),
            header && String(header.format || 'TEXT').toUpperCase() === 'TEXT' ? countTemplateParams(header.text) : 0,
            JSON.stringify((btns?.buttons || []).map((b) => ({ type: String(b.type || '').toUpperCase(), text: b.text || null, url: b.url || null, otp_type: b.otp_type || null }))),
            tpl.rejected_reason && tpl.rejected_reason !== 'NONE' ? String(tpl.rejected_reason) : null,
            t,
          );
        }
        // ما لم يعد موجودًا في حساب واتساب يُعلَّم «محذوفًا» (ويبطل أي ربط عليه) دون حذف سجله
        for (const row of db.all('SELECT id, name, language FROM wa_templates WHERE removed_at IS NULL')) {
          if (!seen.has(`${row.name}|${row.language}`)) {
            db.update('wa_templates', row.id, { removed_at: t });
            removed++;
          }
        }
      });
      app.audit?.log({
        actor,
        ctx,
        type: 'whatsapp.templates_synced',
        summary: `مزامنة قوالب واتساب: ${list.length ? arabicCount(list.length, TEMPLATES_UNIT) : 'لا توجد قوالب'} (المعتمد منها: ${approved})`,
        data: { total: list.length, approved, removed },
      });
      return { total: list.length, approved, removed, ...svc.templatesOverview() };
    },

    setMapping(purpose, body, actor, ctx = null) {
      if (!TEMPLATE_PURPOSES[purpose]) throw notFound('الغرض غير معروف');
      const name = v.str(body.template_name, 'القالب', { required: true, max: 512 });
      const language = v.str(body.language, 'لغة القالب', { required: true, max: 20 });
      const tpl = templateRow(name, language);
      if (!tpl || tpl.removed_at) throw badRequest('القالب غير موجود في آخر مزامنة. زامن القوالب ثم أعد المحاولة.');
      if (tpl.status !== 'APPROVED') throw badRequest(`لا يمكن ربط قالب حالته «${LABELS.wa_template_status[tpl.status] || tpl.status}»؛ اختر قالبًا معتمدًا من ميتا.`);
      if (tpl.header_param_count) throw badRequest('القوالب التي تحتوي متغيرات في العنوان غير مدعومة. اختر قالبًا متغيراته في النص فقط.');
      if (purpose === 'otp' && tpl.category !== 'AUTHENTICATION') throw badRequest('رمز الدخول يُرسل بقالب من فئة «مصادقة» فقط وفق سياسة ميتا.');
      const allowed = TEMPLATE_PURPOSES[purpose];
      const params = Array.isArray(body.params) ? body.params.map((p) => String(p || '')) : [];
      if (params.length !== tpl.param_count) {
        throw badRequest(
          tpl.param_count
            ? `القالب «${tpl.name}» يحتوي ${arabicCount(tpl.param_count, ['متغيرًا واحدًا', 'متغيرين', 'متغيرات', 'متغيرًا'])}؛ حدد قيمة لكل متغير بالترتيب.`
            : `القالب «${tpl.name}» لا يحتوي متغيرات؛ اتركها فارغة.`,
        );
      }
      const bad = params.filter((p) => !allowed.includes(p));
      if (bad.length) throw badRequest(`قيمة غير مسموح بها لهذا الغرض: ${bad.join('، ') || '(فارغة)'}`);
      if (purpose === 'otp' && !params.includes('code')) throw badRequest('قالب رمز الدخول يجب أن يتضمن متغير «رمز الدخول».');
      db.run(
        `INSERT INTO wa_template_mappings (purpose, template_name, language, params, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(purpose) DO UPDATE SET template_name = excluded.template_name, language = excluded.language, params = excluded.params,
           updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        purpose,
        tpl.name,
        tpl.language,
        JSON.stringify(params),
        actor?.id ?? null,
        nowIso(),
      );
      app.audit?.log({ actor, ctx, type: 'whatsapp.template_mapped', summary: `رُبط القالب «${tpl.name}» بغرض: ${LABELS.wa_template_purpose[purpose]}`, data: { purpose, template: tpl.name, language: tpl.language, params } });
      return svc.mappings().find((m) => m.purpose === purpose);
    },

    deleteMapping(purpose, actor, ctx = null) {
      if (!TEMPLATE_PURPOSES[purpose]) throw notFound('الغرض غير معروف');
      const r = db.run('DELETE FROM wa_template_mappings WHERE purpose = ?', purpose);
      if (!r.changes) throw notFound('لا يوجد ربط لهذا الغرض');
      app.audit?.log({ actor, ctx, type: 'whatsapp.template_mapped', summary: `أُلغي ربط القالب لغرض: ${LABELS.wa_template_purpose[purpose]}`, data: { purpose, removed: true } });
      return { ok: true };
    },

    /**
     * خطة إرسال القالب لرسالة خارج نافذة الـ 24 ساعة: القالب المربوط بغرضها (قاعدة الأتمتة أو الاستبيان أو رمز الدخول)،
     * ثم قالب «تحديثات الملف»، ثم القالب القديم من الإعدادات (متغير واحد بنص الرسالة).
     */
    templatePlan(msg, meta = {}, secretVars = {}) {
      const wa = meta.wa || {};
      const isOtp = wa.type === 'otp' || wa.purpose === 'otp';
      const purposes = [];
      if (isOtp) purposes.push('otp');
      else {
        if (wa.purpose) purposes.push(wa.purpose);
        if (msg.automation_rule) purposes.push(msg.automation_rule === 'satisfaction_survey' ? 'survey' : `rule:${msg.automation_rule}`);
        purposes.push('case_update');
      }
      const found = resolveMapping([...new Set(purposes)]);
      if (!found) {
        if (isOtp) return null;
        const s = app.settings.all();
        return s.whatsapp_template_name ? { name: s.whatsapp_template_name, language: s.whatsapp_template_language || 'ar', params: [msg.body], buttons: [] } : null;
      }
      const vars = { ...baseVars(msg), ...(meta.vars || {}), ...(secretVars || {}) };
      const params = parseJson(found.mapping.params, []).map((k) => vars[k] ?? '-');
      const buttons = [];
      parseJson(found.template.buttons, []).forEach((b, index) => {
        if (isOtp && (b.type === 'OTP' || (b.type === 'URL' && /\{\{\s*1\s*\}\}/.test(b.url || '')))) {
          buttons.push({ index, sub_type: 'url', value: vars.code });
        } else if (b.type === 'QUICK_REPLY' && wa.survey_id) {
          const r = ratingFromWords(b.text);
          if (r) buttons.push({ index, sub_type: 'quick_reply', value: `svy:${wa.survey_id}:${r}` });
        }
      });
      return { name: found.template.name, language: found.template.language, params, buttons, purpose: found.purpose };
    },

    // ───────────── قراءة الرسائل ─────────────
    /** يُستدعى عند فتح الإدارة محادثة الطلب أو الملف: يعلّم آخر رسالة واتساب من العميل «مقروءة» (أفضل جهد، غير متزامن) */
    markConversationRead({ intakeId = null, caseId = null } = {}) {
      if (!app.whatsapp.configured || (!intakeId && !caseId)) return { queued: 0 };
      const row = db.get(
        `SELECT id, external_id, client_id, created_at FROM messages
         WHERE ${caseId ? 'case_id' : 'intake_id'} = ? AND direction = 'in' AND channel = 'whatsapp' AND external_id IS NOT NULL AND read_receipt_at IS NULL
         ORDER BY id DESC LIMIT 1`,
        caseId || intakeId,
      );
      // ميتا لا تقبل تعليم رسائل أقدم من 30 يومًا
      if (!row || row.created_at < addDays(nowIso(), -30)) return { queued: 0 };
      readQueue.set(row.id, row);
      setImmediate(() => flushReadReceipts().catch((e) => app.log('read receipts', e)));
      return { queued: 1 };
    },
    flushReadReceipts,

    // ───────────── إرسال مستند للعميل ─────────────
    sendDocument(docId, body = {}, actor, ctx = null) {
      const doc = app.documents.get(docId);
      if (!doc) throw notFound('المستند غير موجود');
      if (!doc.client_id) throw badRequest('المستند غير مرتبط بعميل، فلا يمكن إرساله');
      const client = app.clients.get(doc.client_id);
      if (!client) throw notFound('العميل غير موجود');
      const requested = v.oneOf(body.channel || 'auto', ['auto', 'whatsapp', 'website'], 'قناة الإرسال', { required: true });
      const caption = v.str(body.caption, 'النص المرافق', { max: 1000 });
      const phone = app.clients.primaryPhone(client.id);
      const inWindow = app.engine.inWindow(client.id);
      let channel;
      let note = null;
      if (requested === 'whatsapp') {
        if (!phone) throw badRequest('لا يوجد رقم واتساب مسجل لهذا العميل');
        if (!inWindow) {
          throw conflict('لا يسمح واتساب بإرسال المستندات إلا خلال 24 ساعة من آخر رسالة أرسلها العميل. أرسله عبر بوابة العملاء، أو اطلب من العميل مراسلتكم على واتساب ثم أعد الإرسال.');
        }
        channel = 'whatsapp';
      } else if (requested === 'website') {
        channel = 'website';
      } else if (phone && inWindow) {
        channel = 'whatsapp';
      } else {
        channel = 'website';
        note = phone
          ? 'لم يُرسل المستند عبر واتساب لأن آخر رسالة من العميل مضى عليها أكثر من 24 ساعة؛ أُتيح له في بوابة العملاء. تأكد أن لديه رابط البوابة، أو يمكنه الدخول برقم هاتفه من صفحة «دخول بوابة العملاء».'
          : 'لا يوجد رقم واتساب للعميل؛ أُتيح المستند في بوابة العملاء.';
      }
      const caseRow = doc.case_id ? db.get('SELECT id, code, intake_id, matter_id FROM cases WHERE id = ?', doc.case_id) : null;
      const matter = doc.matter_id ? db.get('SELECT id, code, case_id FROM matters WHERE id = ?', doc.matter_id) : null;
      const ref = caseRow?.code || matter?.code || null;
      const title = doc.title || doc.filename;
      const text =
        caption ||
        (channel === 'whatsapp'
          ? `مرفق لكم المستند «${title}»${ref ? ` الخاص بملفكم رقم ${ref}` : ''}. — ${orgName()}`
          : `أتحنا لكم المستند «${title}»${ref ? ` الخاص بملفكم رقم ${ref}` : ''}، ويمكنكم تنزيله من صفحتكم في بوابة العملاء. — ${orgName()}`);
      const msg = app.engine.sendToClient({
        client_id: client.id,
        intake_id: doc.intake_id || caseRow?.intake_id || null,
        case_id: caseRow?.id ?? matter?.case_id ?? null,
        matter_id: matter?.id ?? caseRow?.matter_id ?? null,
        body: text,
        channel,
        author: actor,
        meta: channel === 'whatsapp' ? { wa: { type: 'document', document_id: doc.id, caption: text } } : {},
        attachments: [doc.id],
      });
      app.activity.log({
        case_id: caseRow?.id ?? matter?.case_id ?? null,
        matter_id: matter?.id ?? null,
        client_id: client.id,
        actor,
        type: 'document.sent_to_client',
        summary: `أرسلت الإدارة المستند «${title}» للعميل عبر ${channel === 'whatsapp' ? 'واتساب' : 'بوابة العملاء'}`,
        data: { document_id: doc.id, message_id: msg.id, channel },
      });
      app.audit?.log({ actor, ctx, type: 'document.sent_to_client', summary: `أُرسل المستند #${doc.id} للعميل ${client.code} عبر ${channel === 'whatsapp' ? 'واتساب' : 'بوابة العملاء'}`, data: { document_id: doc.id, client_id: client.id, channel } });
      return { message: mapMessage({ ...msg, author_name: actor?.name || null }), channel, note };
    },

    /** مستند يحق لصاحب رابط البوابة تنزيله: مرفق برسالة ضمن نطاق الرابط (أرسلناه له أو رفعه هو) */
    portalDocument(client, intakeId, docId) {
      const sc = app.portal.scopeOf(client, intakeId);
      const ids = (a) => (a.length ? a.map(Number).join(',') : '-1');
      const scope = `(m.intake_id IN (${ids(sc.intakeIds)}) OR m.case_id IN (${ids(sc.caseIds)}) OR m.matter_id IN (${ids(sc.matterIds)})${
        sc.full ? ' OR (m.intake_id IS NULL AND m.case_id IS NULL AND m.matter_id IS NULL)' : ''
      })`;
      const sent = db.get(
        `SELECT d.* FROM documents d JOIN message_attachments ma ON ma.document_id = d.id JOIN messages m ON m.id = ma.message_id
         WHERE d.id = ? AND m.client_id = ? AND m.direction = 'out' AND m.status IN ('sent','delivered','read','simulated') AND ${scope}`,
        docId,
        client.id,
      );
      if (sent) return sent;
      return (
        db.get(
          `SELECT d.* FROM documents d JOIN messages m ON m.id = d.message_id
           WHERE d.id = ? AND d.uploaded_by_kind = 'client' AND m.client_id = ? AND m.direction = 'in' AND ${scope}`,
          docId,
          client.id,
        ) || null
      );
    },

    // ───────────── دخول البوابة برمز واتساب ─────────────
    verifiedClientForPhone,
    portalOtpAvailable,

    /** طلب رمز: نفس الرد دائمًا سواء كان الرقم مسجلًا أم لا */
    requestPortalCode(ctx, body = {}) {
      if (!portalOtpAvailable()) throw notFound('الدخول برمز واتساب غير متاح حاليًا. تواصل معنا لإرسال رابط صفحتك.');
      const phone = v.phone(body.phone, 'رقم الموبايل', { required: true });
      try {
        limiters.requestIp.hit(`ip:${ctx.ip}`);
      } catch (e) {
        rateLimited(ctx, 'request', null);
        throw e;
      }
      const last = db.get('SELECT created_at FROM portal_otps WHERE phone = ? ORDER BY id DESC LIMIT 1', phone);
      if (last) {
        const wait = Math.ceil((Date.parse(last.created_at) + OTP_COOLDOWN_SECONDS * 1000 - Date.parse(nowIso())) / 1000);
        if (wait > 0) {
          throw new ApiError(429, `يمكنك طلب رمز جديد بعد ${arabicCount(wait, SECONDS)}.`, 'otp_cooldown', { retry_after: wait });
        }
      }
      try {
        limiters.requestPhone.hit(`phone:${phone}`);
      } catch (e) {
        rateLimited(ctx, 'request', phone);
        throw e;
      }
      const client = verifiedClientForPhone(phone);
      const challenge = randomToken(24);
      const challengeHash = sha256(challenge);
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      const t = nowIso();
      const otpId = db.tx(() => {
        // رمز جديد يُبطل أي رمز سابق لم يُستخدم لنفس الرقم
        db.run('UPDATE portal_otps SET locked_at = ? WHERE phone = ? AND consumed_at IS NULL AND locked_at IS NULL', t, phone);
        return db.insert('portal_otps', {
          challenge_hash: challengeHash,
          phone,
          client_id: client?.id ?? null,
          code_hash: otpHash(challengeHash, code),
          ip: ctx.ip || null,
          created_at: t,
          expires_at: addHours(t, OTP_TTL_MINUTES / 60),
        });
      });
      if (client) {
        // تسجيل الرسالة وإرسالها بعد الرد: مسار الرقم الموثّق ومسار الرقم المجهول يتطابقان فيما ينفَّذ قبل الرد،
        // فلا يكشف زمن الاستجابة وجود الرقم لدينا
        setImmediate(() => {
          try {
            const org = orgName();
            const realText = `رمز الدخول إلى بوابة العملاء لدى ${org}: ${code}\nصالح لمدة ${OTP_TTL_MINUTES} دقائق. لا تشارك هذا الرمز مع أي شخص؛ لن يطلبه منك أحد من فريقنا.`;
            // في وضع المحاكاة (خارج الإنتاج أو في النسخة التجريبية فقط) يُسجَّل الرمز في صندوق الصادر لتجربة الدخول؛
            // أما مع واتساب الحقيقي فلا يُحفظ الرمز في قاعدة البيانات أبدًا
            const simulationOk = !app.config?.production || !!app.config?.demo;
            const stored = app.whatsapp.configured || !simulationOk ? `رمز الدخول إلى بوابة العملاء لدى ${org}: •••••• (أُرسل للعميل فقط ولا يُحفظ)` : realText;
            const hasTemplate = !!resolveMapping(['otp']);
            const msg = app.engine.record({
              client_id: client.id,
              channel: 'whatsapp',
              to: phone,
              body: stored,
              automated: true,
              rule: 'portal_otp',
              meta: { wa: { type: 'otp', force_template: hasTemplate }, otp_id: otpId },
              secret: { text: realText, vars: { code } },
            });
            db.update('portal_otps', otpId, { message_id: msg.id });
          } catch (e) {
            app.log('portal otp message failed', e);
          }
        });
      }
      app.audit?.log({
        ctx,
        actor: { kind: 'client' },
        type: 'portal.otp_requested',
        summary: `طُلب رمز دخول لبوابة العملاء للرقم ${maskPhone(phone)}${client ? ` (العميل ${client.code})` : ' (رقم غير موثّق — لم يُرسل رمز)'}`,
        data: { phone: maskPhone(phone), matched: !!client, client_id: client?.id ?? null },
      });
      return {
        ok: true,
        challenge,
        expires_in: OTP_TTL_MINUTES * 60,
        resend_after: OTP_COOLDOWN_SECONDS,
        message: 'إذا كان هذا الرقم مسجلًا لدينا فسيصلك خلال لحظات رمز من 6 أرقام عبر واتساب. أدخله هنا للدخول إلى صفحتك.',
      };
    },

    /** التحقق من الرمز وإصدار رابط بوابة كامل للعميل */
    verifyPortalCode(ctx, body = {}) {
      try {
        limiters.verifyIp.hit(`ip:${ctx.ip}`);
      } catch (e) {
        rateLimited(ctx, 'verify', null);
        throw e;
      }
      const challenge = typeof body.challenge === 'string' ? body.challenge.trim() : '';
      const code = latinDigits(String(body.code ?? '')).replace(/\D/g, '');
      if (!/^\d{6}$/.test(code)) throw badRequest('أدخل الرمز المكون من 6 أرقام كما وصلك');
      const INVALID = 'الرمز غير صحيح أو انتهت صلاحيته. يمكنك طلب رمز جديد.';
      if (!challenge || challenge.length > 100) throw badRequest(INVALID);
      const challengeHash = sha256(challenge);
      const row = db.get('SELECT * FROM portal_otps WHERE challenge_hash = ?', challengeHash);
      const t = nowIso();
      if (!row || row.consumed_at || row.locked_at || row.expires_at <= t) throw badRequest(INVALID);
      const attempts = row.attempts + 1;
      const expected = Buffer.from(row.code_hash, 'hex');
      const got = Buffer.from(otpHash(challengeHash, code), 'hex');
      const match = expected.length === got.length && crypto.timingSafeEqual(expected, got) && !!row.client_id;
      if (!match) {
        const locked = attempts >= OTP_MAX_ATTEMPTS;
        db.update('portal_otps', row.id, { attempts, locked_at: locked ? t : null });
        app.audit?.log({
          ctx,
          actor: { kind: 'client' },
          type: locked ? 'portal.otp_locked' : 'portal.otp_failed',
          severity: locked ? 'warning' : 'info',
          summary: locked
            ? `أُوقف رمز دخول البوابة للرقم ${maskPhone(row.phone)} بعد ${arabicCount(OTP_MAX_ATTEMPTS, ATTEMPTS)} فاشلة`
            : `رمز دخول بوابة غير صحيح للرقم ${maskPhone(row.phone)}`,
          data: { phone: maskPhone(row.phone), attempts },
        });
        if (locked) throw badRequest('تجاوزت عدد المحاولات المسموح به لهذا الرمز. اطلب رمزًا جديدًا.', { attempts_left: 0 });
        const left = OTP_MAX_ATTEMPTS - attempts;
        throw badRequest(`الرمز غير صحيح. يتبقى لك ${arabicCount(left, ATTEMPTS_LEFT)}.`, { attempts_left: left });
      }
      const client = app.clients.get(row.client_id);
      if (!client) throw badRequest(INVALID);
      db.update('portal_otps', row.id, { attempts, consumed_at: t });
      const token = app.clients.issuePortalToken(client.id);
      app.activity.log({ client_id: client.id, actor: { kind: 'client' }, type: 'portal.otp_login', summary: 'دخل العميل إلى بوابة العملاء برمز وصله عبر واتساب' });
      app.audit?.log({ ctx, actor: { kind: 'client' }, type: 'portal.otp_login', summary: `دخل العميل ${client.code} إلى بوابة العملاء برمز واتساب`, data: { client_id: client.id, phone: maskPhone(row.phone) } });
      return { ok: true, redirect: `/p/${token}`, portal_url: app.clients.portalUrl(token) };
    },

    // ───────────── استبيان الرضا ─────────────
    /** يُستدعى من قاعدة الأتمتة satisfaction_survey: استبيان واحد لكل ملف بعد إرسال الرد النهائي بعدد الساعات المحدد */
    runSurveys(params, { once }) {
      const t = nowIso();
      const after = Number(params.after_hours) || 24;
      const expireDays = Number(params.expire_days) || 7;
      const cutoff = addHours(t, -after);
      // لا نرسل استبيانًا عن رد مضى عليه أكثر من أسبوع بعد الموعد (مثل تفعيل القاعدة لأول مرة على ملفات قديمة)
      const oldest = addHours(cutoff, -24 * 7);
      const rows = db.all(
        `SELECT a.id AS answer_id, a.sent_at, c.id AS case_id, c.code, c.client_id, c.intake_id, c.matter_id
         FROM client_answers a JOIN cases c ON c.id = a.case_id
         WHERE a.status = 'sent' AND a.sent_at <= ? AND a.sent_at >= ?
           AND a.id = (SELECT MAX(x.id) FROM client_answers x WHERE x.case_id = a.case_id AND x.status = 'sent')
           AND NOT EXISTS (SELECT 1 FROM case_surveys s WHERE s.case_id = c.id)`,
        cutoff,
        oldest,
      );
      let n = 0;
      for (const r of rows) {
        const client = app.clients.get(r.client_id);
        if (!client) continue;
        const did = once('satisfaction_survey', `case:${r.case_id}`, 'case', r.case_id, () => {
          const sent = nowIso();
          const surveyId = db.insert('case_surveys', {
            case_id: r.case_id,
            client_id: client.id,
            client_answer_id: r.answer_id,
            status: 'sent',
            sent_at: sent,
            expires_at: addDays(sent, expireDays),
          });
          const org = orgName();
          const body = fillVars(params.template, { case_code: r.code, org_name: org, client_name: client.name || '' }).replace(/\s{2,}/g, ' ').trim();
          const msg = app.engine.sendToClient({
            client_id: client.id,
            intake_id: r.intake_id,
            case_id: r.case_id,
            matter_id: r.matter_id,
            body,
            automated: true,
            rule: 'satisfaction_survey',
            meta: {
              survey_id: surveyId,
              vars: { case_code: r.code, client_name: client.name || undefined },
              wa: {
                type: 'buttons',
                purpose: 'survey',
                survey_id: surveyId,
                text: `نرجو أن يكون ردنا في ملفكم رقم ${r.code} قد أفادكم. كيف تقيّمون خدمة ${org}؟`,
                footer: 'يمكنكم أيضًا الرد برقم من 1 إلى 5',
                buttons: SURVEY_BUTTONS.map((b) => ({ id: `svy:${surveyId}:${b.rating}`, title: b.title })),
              },
            },
          });
          db.update('case_surveys', surveyId, { message_id: msg.id, channel: msg.channel });
          app.activity.log({ case_id: r.case_id, client_id: client.id, actor: { kind: 'system' }, type: 'survey.sent', summary: `أُرسل للعميل استبيان رضا عن الخدمة عبر ${LABELS.channel[msg.channel]}` });
          return { message_id: msg.id, survey_id: surveyId };
        });
        if (did) n++;
      }
      return n;
    },

    /** هل هذه الرسالة الواردة رد على استبيان مفتوح؟ (يُستدعى من محرك الاستقبال داخل معاملته) */
    matchSurveyReply(client, msg, text, { verifiedSender } = {}) {
      if (msg.force_new_intake || msg.info_request_id || msg.target_case_id) return null;
      if ((msg.attachments || []).length) return null;
      const t = nowIso();
      const caseOf = (s) => db.get('SELECT * FROM cases WHERE id = ?', s.case_id);
      const inScope = (s) => {
        if (verifiedSender || !msg.target_intake_id) return true;
        const c = caseOf(s);
        return !!c && c.intake_id === msg.target_intake_id;
      };
      // 1) زر صريح من رسالة الاستبيان التفاعلية أو زر رد سريع في القالب: svy:<id>:<rating>
      // (لا لبس فيه، فيُقبل حتى بعد انقضاء مدة الاستبيان بدل أن يفتح طلبًا جديدًا بكلمة «ممتاز»)
      const rid = /^svy:(\d+):([1-5])$/.exec(msg.reply?.id || '');
      if (rid) {
        // المطابقة عبر الملف (لا عبر client_id المحفوظ) حتى تبقى صحيحة بعد دمج عميلين
        const s = db.get('SELECT s.* FROM case_surveys s JOIN cases c ON c.id = s.case_id WHERE s.id = ? AND c.client_id = ?', Number(rid[1]), client.id);
        if (s && inScope(s)) return { survey: s, caseRow: caseOf(s), rating: Number(rid[2]), kind: 'button' };
        return null;
      }
      const s = db.get(
        `SELECT s.* FROM case_surveys s JOIN cases c ON c.id = s.case_id
         WHERE c.client_id = ? AND s.status IN ('sent','awaiting_comment') AND s.expires_at > ? ORDER BY s.id DESC LIMIT 1`,
        client.id,
        t,
      );
      if (!s || !inScope(s)) return null;
      // الرد الرقمي أو بالكلمات يُعتمد فقط إن كان الاستبيان (أو طلب التعليق) آخر ما أرسلناه للعميل،
      // حتى لا يُلتقط رقم يجيب به العميل عن سؤال آخر من الإدارة («3» ورثة مثلًا)
      const lastOut = db.get("SELECT id FROM messages WHERE client_id = ? AND direction = 'out' AND status != 'failed' ORDER BY id DESC LIMIT 1", client.id);
      if (s.status === 'sent') {
        if (msg.reply) {
          const r = ratingFromWords(msg.reply.title || text);
          if (r) return { survey: s, caseRow: caseOf(s), rating: r, kind: 'button' };
        }
        if (lastOut?.id !== s.message_id) return null;
        const d = ratingFromDigits(text);
        if (d) return { survey: s, caseRow: caseOf(s), rating: d.rating, comment: d.comment, kind: 'digit' };
        const w = ratingFromWords(text);
        if (w) return { survey: s, caseRow: caseOf(s), rating: w, kind: 'text' };
        return null;
      }
      if (s.status === 'awaiting_comment' && s.comment_until && s.comment_until > t && lastOut?.id === s.followup_message_id && String(text).trim().length >= 2) {
        return { survey: s, caseRow: caseOf(s), comment: String(text).trim().slice(0, 2000), kind: 'comment' };
      }
      return null;
    },

    /** حفظ التقييم أو التعليق (داخل معاملة الاستقبال) */
    recordSurveyReply(match, { messageId, channel }) {
      const s = match.survey;
      const c = match.caseRow;
      const t = nowIso();
      const existing = db.get('SELECT * FROM case_feedback WHERE survey_id = ? ORDER BY id DESC LIMIT 1', s.id);
      if (match.kind === 'comment') {
        const comment = existing?.comment ? `${existing.comment}\n${match.comment}`.slice(0, 2000) : match.comment;
        if (existing) db.update('case_feedback', existing.id, { comment, updated_at: t });
        db.update('case_surveys', s.id, { status: 'answered', comment_until: null });
        app.activity.log({ case_id: c.id, client_id: s.client_id, actor: { kind: 'client' }, type: 'survey.comment', summary: `أضاف العميل تعليقًا على تقييمه للخدمة: «${truncate(match.comment, 120)}»` });
        app.notifications.notifyStaff(
          { type: 'survey.comment', title: `تعليق العميل على تقييم الخدمة في الملف ${c.code}`, body: truncate(match.comment, 200), link: `#/cases/${c.id}` },
          { caseManagerId: c.case_manager_id },
        );
        return { type: 'comment', survey_id: s.id, case_id: c.id, client_id: s.client_id, channel, rating: existing?.rating ?? null };
      }
      const rating = Math.max(1, Math.min(5, Number(match.rating)));
      let feedbackId;
      if (existing) {
        db.update('case_feedback', existing.id, { rating, comment: match.comment ?? existing.comment, channel, message_id: messageId, updated_at: t });
        feedbackId = existing.id;
      } else {
        feedbackId = db.insert('case_feedback', {
          case_id: c.id,
          client_id: s.client_id,
          survey_id: s.id,
          rating,
          comment: match.comment ?? null,
          channel,
          message_id: messageId,
          created_at: t,
          updated_at: t,
        });
      }
      const low = rating <= lowThreshold();
      const askComment = low && !match.comment && !existing;
      db.update('case_surveys', s.id, {
        status: askComment ? 'awaiting_comment' : 'answered',
        answered_at: s.answered_at || t,
        comment_until: askComment ? addHours(t, COMMENT_WINDOW_HOURS) : null,
      });
      app.activity.log({
        case_id: c.id,
        client_id: s.client_id,
        actor: { kind: 'client' },
        type: 'survey.answered',
        summary: `قيّم العميل الخدمة: ${rating} من 5 (${LABELS.satisfaction_rating[rating]})${match.comment ? ` — «${truncate(match.comment, 100)}»` : ''}`,
        data: { rating, feedback_id: feedbackId },
      });
      if (low) {
        app.notifications.notifyStaff(
          {
            type: 'survey.low_rating',
            title: `تقييم منخفض من العميل في الملف ${c.code}: ${rating} من 5`,
            body: match.comment ? truncate(match.comment, 200) : 'لم يكتب العميل سببًا بعد، وطُلب منه توضيح ما لم يعجبه. يُنصح بالتواصل معه.',
            link: `#/cases/${c.id}`,
          },
          { caseManagerId: c.case_manager_id },
        );
      }
      return { type: 'rating', survey_id: s.id, case_id: c.id, client_id: s.client_id, channel, rating, low, ask_comment: askComment, updated: !!existing };
    },

    /** رسالة الشكر بعد التقييم (أو طلب التوضيح بعد تقييم منخفض) */
    afterSurveyReply(outcome) {
      if (!outcome || outcome.updated) return null;
      const c = db.get('SELECT id, client_id, intake_id, matter_id FROM cases WHERE id = ?', outcome.case_id);
      if (!c) return null;
      const org = orgName();
      let body;
      if (outcome.type === 'comment') body = `شكرًا لتوضيحكم، وصلت ملاحظتكم إلى مسؤول الملف وسيتابعها معكم. — ${org}`;
      else if (outcome.ask_comment) body = `نأسف لأن تجربتكم لم تكن كما تستحقون. نرجو أن تكتبوا لنا في رسالة واحدة ما الذي لم يعجبكم أو ما يمكننا تحسينه، وسيتواصل معكم مسؤول الملف. — ${org}`;
      else body = `شكرًا جزيلًا على تقييمكم. يسعدنا أن نكون في خدمتكم دائمًا، ويمكنكم مراسلتنا في أي وقت. — ${org}`;
      const msg = app.engine.sendToClient({
        client_id: c.client_id,
        intake_id: c.intake_id,
        case_id: c.id,
        matter_id: c.matter_id,
        body,
        channel: outcome.channel === 'whatsapp' ? 'whatsapp' : 'website',
        automated: true,
        rule: 'satisfaction_survey',
        meta: { survey_id: outcome.survey_id, survey_followup: outcome.type === 'comment' ? 'comment_thanks' : outcome.ask_comment ? 'ask_comment' : 'thanks' },
      });
      if (outcome.ask_comment) db.update('case_surveys', outcome.survey_id, { followup_message_id: msg.id });
      return msg;
    },

    /** إنهاء الاستبيانات التي انقضت مدتها */
    expireSurveys() {
      const t = nowIso();
      const a = db.run("UPDATE case_surveys SET status = 'expired' WHERE status = 'sent' AND expires_at <= ?", t);
      db.run("UPDATE case_surveys SET status = 'answered', comment_until = NULL WHERE status = 'awaiting_comment' AND comment_until <= ?", t);
      return a.changes;
    },

    /** تقييم العميل للملف (لصفحة الملف) */
    caseSatisfaction(caseId) {
      const s = db.get('SELECT * FROM case_surveys WHERE case_id = ?', caseId);
      const f = db.get('SELECT * FROM case_feedback WHERE case_id = ? ORDER BY id DESC LIMIT 1', caseId);
      const expired = s && s.status === 'sent' && s.expires_at <= nowIso();
      const status = expired ? 'expired' : s?.status || null;
      let text;
      if (f) text = `${f.rating} من 5 — ${LABELS.satisfaction_rating[f.rating]}`;
      else if (!s) text = 'لم يُرسل استبيان الرضا بعد';
      else if (status === 'expired') text = 'انتهت مدة الاستبيان دون تقييم';
      else text = 'أُرسل الاستبيان — بانتظار تقييم العميل';
      return {
        rating: f?.rating ?? null,
        rating_label: f ? LABELS.satisfaction_rating[f.rating] : null,
        comment: f?.comment ?? null,
        channel: f?.channel ?? s?.channel ?? null,
        rated_at: f?.updated_at ?? null,
        low: f ? f.rating <= lowThreshold() : false,
        survey: s ? { id: s.id, status, status_label: LABELS.survey_status[status], sent_at: s.sent_at, expires_at: s.expires_at } : null,
        text,
      };
    },

    /** متوسط رضا العملاء عن الملفات التي اعتُمد فيها رأي المحامي */
    lawyerSatisfaction(lawyerId) {
      const r = db.get(
        `SELECT AVG(f.rating) AS avg, COUNT(*) AS n FROM case_feedback f
         WHERE f.id IN (SELECT MAX(id) FROM case_feedback GROUP BY case_id)
           AND f.case_id IN (SELECT case_id FROM assignments WHERE lawyer_id = ? AND status = 'approved')`,
        lawyerId,
      );
      return { avg_client_satisfaction: r?.n ? Math.round(r.avg * 10) / 10 : null, client_ratings: Number(r?.n || 0) };
    },

    /** تحليلات الرضا: بالشهر، بالمجال القانوني، بالمحامي الأساسي، وتوزيع التقييمات وآخر التعليقات */
    surveySummary({ from, to } = {}) {
      const fromIso = isValidPeriod(from) ? periodRange(from).start : v.iso(from, 'من');
      const toIso = isValidPeriod(to) ? periodRange(to).end : v.iso(to, 'إلى');
      const where = ['f.id IN (SELECT MAX(id) FROM case_feedback GROUP BY case_id)'];
      const params = [];
      if (fromIso) {
        where.push('f.created_at >= ?');
        params.push(fromIso);
      }
      if (toIso) {
        where.push('f.created_at < ?');
        params.push(toIso);
      }
      const rows = db.all(
        `SELECT f.*, c.code AS case_code, c.legal_area, c.title AS case_title,
           (SELECT a.lawyer_id FROM assignments a WHERE a.case_id = f.case_id AND a.role = 'lead' AND a.status = 'approved' ORDER BY a.id DESC LIMIT 1) AS lead_id
         FROM case_feedback f JOIN cases c ON c.id = f.case_id WHERE ${where.join(' AND ')} ORDER BY f.created_at DESC`,
        ...params,
      );
      const sWhere = ['1=1'];
      const sParams = [];
      if (fromIso) {
        sWhere.push('sent_at >= ?');
        sParams.push(fromIso);
      }
      if (toIso) {
        sWhere.push('sent_at < ?');
        sParams.push(toIso);
      }
      const surveys = db.all(`SELECT status, sent_at FROM case_surveys WHERE ${sWhere.join(' AND ')}`, ...sParams);
      const threshold = lowThreshold();
      const avg = (list) => (list.length ? Math.round((list.reduce((s, x) => s + x.rating, 0) / list.length) * 100) / 100 : null);
      const group = (keyFn) => {
        const m = new Map();
        for (const r of rows) {
          const k = keyFn(r);
          if (k === null || k === undefined) continue;
          if (!m.has(k)) m.set(k, []);
          m.get(k).push(r);
        }
        return m;
      };
      const distribution = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, rows.filter((r) => r.rating === n).length]));
      const sentByMonth = new Map();
      for (const s of surveys) sentByMonth.set(periodOf(s.sent_at), (sentByMonth.get(periodOf(s.sent_at)) || 0) + 1);
      const byMonthMap = group((r) => periodOf(r.created_at));
      const months = [...new Set([...byMonthMap.keys(), ...sentByMonth.keys()])].sort();
      const lawyerNames = new Map(
        db.all("SELECT u.id, u.name, l.title FROM users u LEFT JOIN lawyers l ON l.user_id = u.id WHERE u.role = 'lawyer'").map((u) => [u.id, `${u.title || ''} ${u.name}`.trim()]),
      );
      return {
        threshold,
        totals: {
          surveys_sent: surveys.length,
          responses: rows.length,
          awaiting: surveys.filter((s) => s.status === 'sent').length,
          response_rate: surveys.length ? Math.round((rows.length / surveys.length) * 1000) / 1000 : null,
          avg_rating: avg(rows),
          low_ratings: rows.filter((r) => r.rating <= threshold).length,
          promoters: rows.filter((r) => r.rating >= 4).length,
        },
        distribution,
        by_month: months.map((p) => {
          const list = byMonthMap.get(p) || [];
          return { period: p, label: arabicPeriod(p), sent: sentByMonth.get(p) || 0, responses: list.length, avg_rating: avg(list) };
        }),
        by_area: [...group((r) => r.legal_area)].map(([area, list]) => ({ area, label: AREA[area] || area, responses: list.length, avg_rating: avg(list), low: list.filter((r) => r.rating <= threshold).length })).sort((a, b) => b.responses - a.responses),
        by_lawyer: [...group((r) => r.lead_id)].map(([id, list]) => ({ lawyer_id: id, name: lawyerNames.get(id) || '—', responses: list.length, avg_rating: avg(list), low: list.filter((r) => r.rating <= threshold).length })).sort((a, b) => b.responses - a.responses),
        recent: rows.slice(0, 20).map((r) => ({
          id: r.id,
          case_id: r.case_id,
          case_code: r.case_code,
          case_title: r.case_title,
          legal_area: r.legal_area,
          rating: r.rating,
          rating_label: LABELS.satisfaction_rating[r.rating],
          comment: r.comment,
          channel: r.channel,
          low: r.rating <= threshold,
          created_at: r.created_at,
        })),
      };
    },

    /** صيانة دورية: انتهاء الاستبيانات وحذف رموز الدخول القديمة */
    housekeeping() {
      const expired = svc.expireSurveys();
      const purged = db.run('DELETE FROM portal_otps WHERE expires_at < ?', addDays(nowIso(), -2)).changes;
      return { expired_surveys: expired, purged_otps: purged };
    },
  };

  app.jobs?.register('messaging.housekeeping', {
    everyMinutes: 30,
    label: 'الرسائل: انتهاء الاستبيانات وحذف رموز الدخول القديمة',
    run: async () => svc.housekeeping(),
  });

  app.metaProviders?.push(() => ({
    messaging: {
      portal_otp_enabled: portalOtpAvailable(),
      whatsapp_live: !!app.whatsapp.configured,
    },
  }));

  return svc;
}
