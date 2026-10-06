// أدوات الممارسة القانونية والعمل الأهلي: بطاقة المستفيد، الأثر، تعارض المصالح، التقويم، الاستيراد والتصدير، زمن الاستجابة
// (الإصدار 9 — وحدة practice)
//
// قواعد الخصوصية في هذه الوحدة:
// - بطاقة المستفيد والأطراف وتقرير الأثر للإدارة فقط؛ لا يصل المحامي إلى أي منها.
// - تقويم المحامي وبحثه مقصوران على إسناداته وملفاته المستمرة، ولا يتضمنان أي بيانات اتصال للعميل.
// - رابط اشتراك التقويم سري ومخزن مُجزّأً، ولا يتضمن التقويم الخارجي أسماء المستفيدين أو هواتفهم.
import {
  nowIso, addDays, addHours, cairoParts, cairoLocalToIso, cairoDayKey, periodOf, arabicCount,
  fromMinor, formatEgp, normalizeArabic, latinDigits, normalizePhone, maskPhone, randomToken, sha256, parseJson, truncate,
  badRequest, notFound, conflict, v, AR_UNITS,
} from '../util.js';
import { LABELS, ENUMS, LEGAL_AREAS, AREA_CODES, GOVERNORATES } from '../constants.js';
import { validateAgreement, describeAgreement } from './accounting.js';
import { UNUSABLE_PASSWORD } from '../auth.js';
import { validateNationalId } from './clients.js';
import {
  normalizeName, isGenericName, compareNames, nameTokens, normalizeNationalId, vulnerabilityScore, priorityRaises,
  toCsv, parseCsv, buildIcs,
} from './practice-lib.js';

// مسميات أحداث سجل الأمان الخاصة بهذه الوحدة تُضاف إلى مجموعة security_event (لصفحة سجل الأمان) دون تعديل كتلة وحدة الحسابات
if (LABELS.security_event && LABELS.practice_security_event) {
  for (const [k, val] of Object.entries(LABELS.practice_security_event)) if (!LABELS.security_event[k]) LABELS.security_event[k] = val;
}

const AREA = Object.fromEntries(LEGAL_AREAS.map((a) => [a.code, a.label]));
const OPEN_INTAKE = ['new', 'in_review', 'awaiting_client'];
// قنوات تنتظر ردًا من الإدارة (المكالمات والحضور الشخصي يُرد عليها لحظة تسجيلها)
const SLA_CHANNELS = ['whatsapp', 'website'];
// حد التنبيهات المستقلة في التشغيل الواحد لمهمة مستوى الخدمة (الباقي في تنبيه مجمّع واحد)
const SLA_INDIVIDUAL_ALERTS = 10;
// أول رد بشري: رسالة صادرة غير آلية كتبها مستخدم من الإدارة ولم يفشل إرسالها
const FIRST_RESPONSE_SQL = `(SELECT MIN(fr.created_at) FROM messages fr WHERE fr.intake_id = i.id AND fr.direction = 'out'
  AND fr.automated = 0 AND fr.author_user_id IS NOT NULL AND fr.status != 'failed')`;
const LEVEL_RANK = { high: 0, review: 1, info: 2 };
// صيغ عدّ الصفوف بالرفع («أُضيف صفان»، «تصدير 5 صفوف»)
const ROW_FORMS = ['صف واحد', 'صفان', 'صفوف', 'صفًا'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const egp = (minor) => (minor === null || minor === undefined ? null : fromMinor(minor));
const cairoStamp = (iso) => {
  if (!iso) return '';
  const p = cairoParts(iso);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};
const cairoDate = (iso) => (iso ? cairoDayKey(iso) : '');
const yesNo = (b) => (b ? 'نعم' : 'لا');
// عزل اتجاه النص اللاتيني (أرقام الهواتف المقنّعة) داخل جملة عربية
const isoLtr = (s) => `${String.fromCharCode(0x2066)}${s}${String.fromCharCode(0x2069)}`;

export function createPractice(app) {
  const { db } = app;

  // دوال SQL للمطابقة العربية (أ/ا، ة/ه، ى/ي، التشكيل، الألقاب). تُحفظ نتائج التوحيد في ذاكرة محدودة لأن فحص
  // تعارض المصالح والبحث يمران على كل أسماء العملاء في كل مرة (≈ 11 ضعفًا أسرع مع 20 ألف عميل)
  const memo = (fn, max = 50000) => {
    const cache = new Map();
    return (s) => {
      let out = cache.get(s);
      if (out === undefined) {
        out = fn(s);
        if (cache.size >= max) cache.clear();
        cache.set(s, out);
      }
      return out;
    };
  };
  const arMemo = memo(normalizeArabic);
  const nameMemo = memo(normalizeName);
  try {
    db.raw.function('practice_ar', { deterministic: true }, (s) => (s === null || s === undefined ? null : arMemo(String(s))));
    db.raw.function('practice_name', { deterministic: true }, (s) => (s === null || s === undefined ? null : nameMemo(String(s))));
  } catch (e) {
    app.log('practice: sqlite functions unavailable', e);
  }

  const cairoYearNow = () => cairoParts(nowIso()).year;
  const userName = (id) => (id ? db.value('SELECT name FROM users WHERE id = ?', id) ?? null : null);

  // ═══════════════════════ 1) بطاقة المستفيد ═══════════════════════

  function validateChildren(list) {
    if (list === undefined || list === null) return [];
    if (!Array.isArray(list)) throw badRequest('بيانات الأبناء يجب أن تكون قائمة');
    if (list.length > 20) throw badRequest('عدد الأبناء المسجلين أكبر من المسموح (20)');
    const year = cairoYearNow();
    return list.map((k, i) => {
      if (!k || typeof k !== 'object') throw badRequest(`بيانات الابن رقم ${i + 1} غير صالحة`);
      // لا نخزن أسماء الأبناء إطلاقًا: سنة الميلاد والنوع فقط
      const by = v.int(k.birth_year, `سنة ميلاد الابن رقم ${i + 1}`, { required: true, min: year - 40, max: year });
      const gender = v.oneOf(k.gender, ENUMS.child_gender, `نوع الابن رقم ${i + 1}`);
      return { birth_year: by, gender };
    });
  }

  /** التحقق من بيانات البطاقة (كل الحقول اختيارية؛ partial=true يتحقق فقط مما أُرسل) */
  function validateBeneficiary(body, { partial = false } = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('بيانات البطاقة غير صالحة');
    const has = (k) => !partial || body[k] !== undefined;
    const out = {};
    if (has('relation')) out.relation = v.oneOf(body.relation, ENUMS.beneficiary_relation, 'صفة المستفيد');
    if (has('children')) out.children = JSON.stringify(validateChildren(body.children));
    if (has('children_count')) out.children_count = v.int(body.children_count, 'عدد الأبناء', { min: 0, max: 30 });
    if (has('monthly_income_band')) out.monthly_income_band = v.oneOf(body.monthly_income_band, ENUMS.income_band, 'الدخل الشهري للأسرة');
    if (has('housing')) out.housing = v.oneOf(body.housing, ENUMS.housing, 'السكن');
    if (has('employment')) out.employment = v.oneOf(body.employment, ENUMS.employment, 'العمل');
    if (has('has_disability')) out.has_disability = v.bool(body.has_disability) ? 1 : 0;
    if (has('foundation_file_number')) {
      const f = v.str(body.foundation_file_number === null ? null : latinDigits(body.foundation_file_number), 'رقم الملف لدى المؤسسة', { max: 40 });
      if (f && !/^[\p{L}\p{N}][\p{L}\p{N} /._-]*$/u.test(f)) throw badRequest('رقم الملف لدى المؤسسة يقبل الحروف والأرقام والشرطة والشرطة المائلة فقط');
      out.foundation_file_number = f;
    }
    if (has('is_foundation_beneficiary')) out.is_foundation_beneficiary = v.bool(body.is_foundation_beneficiary) ? 1 : 0;
    if (has('notes')) out.notes = v.str(body.notes, 'ملاحظات البحث الاجتماعي', { max: 3000 });
    const kids = out.children ? JSON.parse(out.children) : null;
    if (kids && kids.length) {
      if (out.children_count === null || out.children_count === undefined) out.children_count = kids.length;
      else if (out.children_count < kids.length) throw badRequest('عدد الأبناء أقل من عدد سنوات الميلاد المسجلة');
    }
    if (out.foundation_file_number && body.is_foundation_beneficiary === undefined) out.is_foundation_beneficiary = 1;
    return out;
  }

  /** حقول نموذج الموقع (عقد واجهة الموقع): بيانات يذكرها مقدم الطلب عن نفسه ولا يُتحقق منها */
  const PUBLIC_FIELDS = ['relation', 'children_count', 'foundation_file_number', 'monthly_income_band', 'housing'];
  function validatePublicBeneficiary(input) {
    if (input === undefined || input === null) return null;
    if (typeof input !== 'object' || Array.isArray(input)) throw badRequest('بيانات الأسرة غير صالحة');
    const picked = {};
    for (const k of PUBLIC_FIELDS) if (input[k] !== undefined && input[k] !== '') picked[k] = input[k];
    if (!Object.keys(picked).length) return null;
    const out = validateBeneficiary(picked, { partial: true });
    for (const k of Object.keys(out)) if (out[k] === null || out[k] === undefined) delete out[k];
    return Object.keys(out).length ? out : null;
  }

  function mapProfile(row) {
    if (!row) return null;
    return {
      client_id: row.client_id,
      relation: row.relation,
      children_count: row.children_count,
      children: parseJson(row.children, []),
      monthly_income_band: row.monthly_income_band,
      housing: row.housing,
      employment: row.employment,
      has_disability: !!row.has_disability,
      foundation_file_number: row.foundation_file_number,
      is_foundation_beneficiary: !!row.is_foundation_beneficiary,
      notes: row.notes,
      data_source: row.data_source,
      self_reported: row.data_source === 'self_reported' && !row.verified_at,
      verified: !!row.verified_at,
      verified_at: row.verified_at,
      verified_by_name: userName(row.verified_by),
      updated_at: row.updated_at,
      updated_by_name: userName(row.updated_by),
      created_at: row.created_at,
    };
  }

  function profileRow(clientId) {
    return (
      db.get('SELECT * FROM beneficiary_profiles WHERE client_id = ?', clientId) ||
      // عميل دُمج فيه عميل مكرر له بطاقة: نعرض بطاقة المكرر حتى تُحفظ للعميل الأساسي
      db.get('SELECT p.* FROM beneficiary_profiles p JOIN clients x ON x.id = p.client_id WHERE x.merged_into = ? ORDER BY p.updated_at DESC LIMIT 1', clientId) ||
      null
    );
  }

  function submissionView(s) {
    return { id: s.id, intake_id: s.intake_id, intake_code: s.intake_code || null, data: parseJson(s.data, {}), applied_at: s.applied_at, created_at: s.created_at };
  }

  const beneficiary = {
    validate: validateBeneficiary,
    validatePublic: validatePublicBeneficiary,

    /** البطاقة كاملة للإدارة: البيانات + درجة الاحتياج وأسبابها + ما ذكره مقدمو الطلبات ولم يُعتمد بعد */
    view(clientId, { intakeId = null } = {}) {
      const c = app.clients.require(clientId);
      const profile = mapProfile(profileRow(c.id));
      const year = cairoYearNow();
      const pending = db
        .all(
          `SELECT s.*, i.code AS intake_code FROM beneficiary_submissions s LEFT JOIN intakes i ON i.id = s.intake_id
           WHERE s.client_id = ? AND s.applied_at IS NULL ORDER BY s.id DESC LIMIT 5`,
          c.id,
        )
        .map(submissionView);
      let intake = null;
      if (intakeId) {
        const i = db.get('SELECT id, code, status, priority, client_id FROM intakes WHERE id = ?', intakeId);
        if (i && i.client_id === c.id) {
          const sub = db.get('SELECT s.*, ? AS intake_code FROM beneficiary_submissions s WHERE s.intake_id = ?', i.code, i.id);
          intake = { id: i.id, code: i.code, status: i.status, priority: i.priority, open: OPEN_INTAKE.includes(i.status), submission: sub ? submissionView(sub) : null };
        }
      }
      const score = profile ? vulnerabilityScore(profile, { year }) : null;
      return {
        client: { id: c.id, code: c.code, name: c.name },
        profile,
        score,
        pending_submissions: pending,
        intake,
        priority_suggestion:
          intake && score && intake.open && priorityRaises(intake.priority, score.suggested_priority)
            ? { from: intake.priority, to: score.suggested_priority }
            : null,
      };
    },

    save(clientId, body, actor) {
      const c = app.clients.require(clientId);
      const data = validateBeneficiary(body);
      const t = nowIso();
      const existing = db.get('SELECT * FROM beneficiary_profiles WHERE client_id = ?', c.id);
      const verify = v.bool(body.verify);
      db.tx(() => {
        const patch = {
          ...data,
          data_source: 'staff',
          updated_by: actor.id,
          updated_at: t,
          // تعديل البيانات يُسقط التحقق السابق إلا إذا أكدته الإدارة في نفس الحفظ
          verified_by: verify ? actor.id : null,
          verified_at: verify ? t : null,
        };
        if (existing) db.update('beneficiary_profiles', c.id, patch, 'client_id');
        else db.insert('beneficiary_profiles', { client_id: c.id, ...patch, created_at: t });
        app.activity.log({
          client_id: c.id,
          actor,
          type: 'beneficiary.updated',
          summary: verify ? 'حُدّثت بطاقة المستفيد وأُكّد التحقق من البحث الاجتماعي' : existing ? 'حُدّثت بطاقة المستفيد (البحث الاجتماعي)' : 'أُنشئت بطاقة المستفيد (البحث الاجتماعي)',
        });
      });
      return beneficiary.view(c.id);
    },

    verify(clientId, actor) {
      const c = app.clients.require(clientId);
      let row = db.get('SELECT * FROM beneficiary_profiles WHERE client_id = ?', c.id);
      if (!row) {
        // بطاقة عميل مكرر دُمج قبل إضافة نقل البطاقات عند الدمج: تُنقل للعميل الأساسي ثم تُؤكَّد
        const dup = profileRow(c.id);
        if (dup) beneficiary.onMerged(c.id, dup.client_id);
        row = db.get('SELECT * FROM beneficiary_profiles WHERE client_id = ?', c.id);
      }
      if (!row) throw notFound('لا توجد بطاقة مستفيد لهذا العميل بعد');
      if (row.verified_at) return beneficiary.view(c.id);
      const t = nowIso();
      db.update('beneficiary_profiles', c.id, { verified_by: actor.id, verified_at: t, updated_at: t }, 'client_id');
      app.activity.log({ client_id: c.id, actor, type: 'beneficiary.verified', summary: `أكّد ${actor.name} التحقق من بيانات البحث الاجتماعي` });
      return beneficiary.view(c.id);
    },

    /** حفظ ما ذكره مقدم الطلب في نموذج الموقع (يُستدعى من POST /api/public/intake) */
    savePublic(intake, client, data, { createdClient = false } = {}) {
      if (!data || !intake) return;
      const t = nowIso();
      // يُستدعى بعد إنشاء الطلب: أي تعذر هنا لا يجوز أن يحرم مقدم الطلب من رقم طلبه ورابط بوابته
      try {
        db.tx(() => {
          db.run(
            'INSERT INTO beneficiary_submissions (intake_id, client_id, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(intake_id) DO UPDATE SET data = excluded.data',
            intake.id,
            client?.id ?? null,
            JSON.stringify(data),
            t,
          );
          // عميل جديد تمامًا: تُنشأ له بطاقة بعلامة «ذكره مقدم الطلب» حتى تتحقق منها الإدارة.
          // أما الرقم المطابق لعميل قائم (غير موثّق) فلا يمس بطاقته أبدًا: تبقى البيانات مقترحة على الطلب.
          if (createdClient && client && !db.get('SELECT 1 FROM beneficiary_profiles WHERE client_id = ?', client.id)) {
            db.insert('beneficiary_profiles', { client_id: client.id, ...data, data_source: 'self_reported', created_at: t, updated_at: t });
            db.run('UPDATE beneficiary_submissions SET applied_at = ? WHERE intake_id = ?', t, intake.id);
          }
          app.activity.log({ intake_id: intake.id, client_id: client?.id ?? null, actor: { kind: 'client' }, type: 'beneficiary.self_reported', summary: 'ذكر مقدم الطلب بيانات عن أسرته في نموذج الموقع (غير موثّقة)' });
        });
      } catch (e) {
        app.log('practice.beneficiary.savePublic', e);
      }
    },

    /** اعتماد ما ذكره مقدم الطلب في البطاقة (تُملأ الحقول الفارغة فقط ولا يُستبدل ما سجلته الإدارة) */
    applySubmission(submissionId, actor) {
      const s = db.get('SELECT * FROM beneficiary_submissions WHERE id = ?', submissionId);
      if (!s) throw notFound('البيانات المقترحة غير موجودة');
      if (s.applied_at) throw conflict('اعتُمدت هذه البيانات من قبل');
      const intake = db.get('SELECT id, client_id FROM intakes WHERE id = ?', s.intake_id);
      const clientId = intake?.client_id || s.client_id;
      const c = app.clients.require(clientId);
      const data = parseJson(s.data, {});
      const t = nowIso();
      db.tx(() => {
        const existing = db.get('SELECT * FROM beneficiary_profiles WHERE client_id = ?', c.id);
        if (existing) {
          const patch = {};
          for (const [k, val] of Object.entries(data)) if (existing[k] === null || existing[k] === undefined || existing[k] === '') patch[k] = val;
          // بيانات غير موثّقة دخلت بطاقة موثّقة: يسقط التحقق حتى تراجعها الإدارة وتؤكده من جديد
          if (Object.keys(patch).length) db.update('beneficiary_profiles', c.id, { ...patch, verified_by: null, verified_at: null, updated_by: actor.id, updated_at: t }, 'client_id');
        } else {
          db.insert('beneficiary_profiles', { client_id: c.id, ...data, data_source: 'self_reported', updated_by: actor.id, created_at: t, updated_at: t });
        }
        db.update('beneficiary_submissions', s.id, { applied_at: t, applied_by: actor.id });
        app.activity.log({ client_id: c.id, intake_id: s.intake_id, actor, type: 'beneficiary.applied', summary: 'اعتمدت الإدارة بيانات الأسرة التي ذكرها مقدم الطلب في بطاقة المستفيد (بانتظار التحقق)' });
      });
      return beneficiary.view(c.id, { intakeId: s.intake_id });
    },

    /**
     * دمج عميل مكرر في عميل أساسي: تنتقل بطاقة المكرر إلى الأساسي إن لم تكن له بطاقة
     * (وإلا تبقى بطاقة الأساسي كما هي)، وتنتقل بيانات الأسرة المقترحة من نماذج الموقع.
     */
    onMerged(targetId, otherId) {
      db.run('UPDATE beneficiary_submissions SET client_id = ? WHERE client_id = ?', targetId, otherId);
      if (!db.get('SELECT 1 FROM beneficiary_profiles WHERE client_id = ?', targetId)) {
        db.run('UPDATE beneficiary_profiles SET client_id = ? WHERE client_id = ?', targetId, otherId);
      }
    },

    /** درجة الاحتياج لعميل (أو null) — تُستخدم في التصدير والتقارير */
    scoreOf(clientId) {
      const p = mapProfile(profileRow(clientId));
      return p ? vulnerabilityScore(p, { year: cairoYearNow() }) : null;
    },
  };

  // ═══════════════════════ 2) قيمة الأثر المتحقق ═══════════════════════

  function parseOutcomeValue(input) {
    if (input === undefined || input === null) return null;
    if (typeof input !== 'object' || Array.isArray(input)) throw badRequest('بيانات الأثر المتحقق غير صالحة');
    const kind = v.oneOf(input.outcome_kind, ENUMS.outcome_kind, 'نوع الأثر المتحقق');
    const one = v.money(input.recovered_one_time, 'قيمة الحقوق المستردة دفعة واحدة', { min: 0, max: 1000000000 });
    const monthly = v.money(input.recovered_monthly, 'القيمة الشهرية المستردة', { min: 0, max: 10000000 });
    const notes = v.str(input.notes, 'ملاحظات الأثر', { max: 2000 });
    if (!kind) {
      if (one || monthly || notes) throw badRequest('اختر نوع الأثر المتحقق قبل إدخال القيم');
      return { outcome_kind: null, recovered_one_time_minor: null, recovered_monthly_minor: null, outcome_value_notes: null, clear: true };
    }
    if (kind === 'advice_only' && (one || monthly)) throw badRequest('لا تُسجل مبالغ مع «استشارة دون أثر مالي مباشر»؛ اختر نوع الأثر المناسب');
    return { outcome_kind: kind, recovered_one_time_minor: one ?? null, recovered_monthly_minor: monthly ?? null, outcome_value_notes: notes };
  }

  function outcomeSummary(o) {
    if (!o.outcome_kind) return 'أُزيل تسجيل الأثر المتحقق';
    const parts = [LABELS.outcome_kind[o.outcome_kind]];
    if (o.recovered_one_time_minor) parts.push(`${formatEgp(o.recovered_one_time_minor)} دفعة واحدة`);
    if (o.recovered_monthly_minor) parts.push(`${formatEgp(o.recovered_monthly_minor)} شهريًا`);
    return `سُجّل الأثر المتحقق: ${parts.join(' — ')}`;
  }

  function outcomeView(row) {
    const one = row.recovered_one_time_minor || 0;
    const monthly = row.recovered_monthly_minor || 0;
    return {
      outcome_kind: row.outcome_kind || null,
      recovered_one_time: egp(row.recovered_one_time_minor),
      recovered_monthly: egp(row.recovered_monthly_minor),
      annualized: row.outcome_kind ? fromMinor(one + monthly * 12) : null,
      notes: row.outcome_value_notes || null,
      recorded_at: row.outcome_value_at || null,
    };
  }

  const outcome = {
    parse: parseOutcomeValue,
    get(kind, id) {
      const row = kind === 'matter' ? app.matters.require(id) : app.cases.require(id);
      return { kind, id: row.id, code: row.code, status: row.status, closed: row.status === 'closed', ...outcomeView(row) };
    },
    /** حفظ قيمة الأثر (من نافذة الإغلاق أو لاحقًا). parsed = ناتج parse() */
    save(kind, id, parsed, actor) {
      if (!parsed) return outcome.get(kind, id);
      const row = kind === 'matter' ? app.matters.require(id) : app.cases.require(id);
      const table = kind === 'matter' ? 'matters' : 'cases';
      const { clear, ...fields } = parsed;
      db.update(table, row.id, { ...fields, outcome_value_at: clear ? null : nowIso() });
      app.activity.log({
        case_id: kind === 'matter' ? row.case_id : row.id,
        matter_id: kind === 'matter' ? row.id : null,
        client_id: row.client_id,
        actor,
        type: 'outcome.value',
        summary: outcomeSummary(fields),
        data: { kind: fields.outcome_kind, one_time_minor: fields.recovered_one_time_minor, monthly_minor: fields.recovered_monthly_minor },
      });
      return outcome.get(kind, row.id);
    },
  };

  // ═══════════════════════ 3) أطراف الملفات وتعارض المصالح ═══════════════════════

  /** نطاق «أسرة الملف»: الاستشارة وملفاتها المستمرة وعميلها (لا يُعد تطابقًا داخل نفس الملف) */
  function familyOf({ caseId = null, matterId = null }) {
    if (matterId) {
      const m = app.matters.require(matterId);
      return { caseIds: [m.case_id], matterIds: db.all('SELECT id FROM matters WHERE case_id = ?', m.case_id).map((r) => r.id), clientId: m.client_id, caseId: m.case_id, matterId: m.id, code: m.code };
    }
    if (caseId) {
      const c = app.cases.require(caseId);
      return { caseIds: [c.id], matterIds: db.all('SELECT id FROM matters WHERE case_id = ?', c.id).map((r) => r.id), clientId: c.client_id, caseId: c.id, matterId: null, code: c.code };
    }
    return { caseIds: [], matterIds: [], clientId: null, caseId: null, matterId: null, code: null };
  }

  function levelFor(subjectRole, target, match, singleToken) {
    const strong = match === 'national_id' || (match === 'exact' && !singleToken);
    if (subjectRole === 'opponent') {
      if (target.kind === 'client') return strong ? 'high' : 'review';
      return target.role === 'opponent' ? 'info' : 'review';
    }
    if (subjectRole === 'client') {
      if (target.kind === 'party') {
        if (target.role === 'opponent') return strong ? 'high' : 'review';
        return strong ? 'review' : 'info';
      }
      return 'info';
    }
    // طرف ذو صلة أو شاهد
    if (target.kind === 'client') return strong ? 'review' : 'info';
    return 'info';
  }

  /**
   * فحص اسم (ورقم قومي اختياري) مقابل كل العملاء وأطراف الملفات الأخرى.
   * subjectRole: opponent | related | witness | client (عميل جديد يُفحص مقابل خصوم الملفات الأخرى)
   */
  function checkConflicts({ name, national_id = null }, { subjectRole = 'opponent', family = null, excludePartyId = null, includeClients = true } = {}) {
    const norm = normalizeName(name);
    const nid = normalizeNationalId(national_id);
    const fam = family || { caseIds: [], matterIds: [], clientId: null };
    const singleToken = nameTokens(norm).length < 2;
    const usableName = norm && !isGenericName(norm);
    const out = new Map();
    const push = (key, m) => {
      const prev = out.get(key);
      if (!prev || LEVEL_RANK[m.level] < LEVEL_RANK[prev.level] || (m.match === 'national_id' && prev.match !== 'national_id')) out.set(key, m);
    };

    if (includeClients) {
      const params = [];
      const conds = [];
      if (nid) {
        conds.push('c.national_id = ?');
        params.push(nid);
      }
      if (usableName) {
        conds.push("(c.nn = ? OR c.nn LIKE ? OR ? LIKE c.nn || ' %')");
        params.push(norm, `${norm} %`, norm);
      }
      if (conds.length) {
        // الاسم الموحَّد يُحسب مرة واحدة لكل عميل (MATERIALIZED) بدل ثلاث مرات في شروط المطابقة
        const rows = db.all(
          `WITH c AS MATERIALIZED (SELECT id, code, name, national_id, governorate, ${usableName ? 'practice_name(name)' : 'NULL'} AS nn FROM clients WHERE merged_into IS NULL)
           SELECT c.id, c.code, c.name, c.national_id, c.governorate FROM c WHERE ${conds.join(' OR ')} LIMIT 50`,
          ...params,
        );
        for (const r of rows) {
          if (fam.clientId && r.id === fam.clientId) continue;
          const match = nid && r.national_id === nid ? 'national_id' : compareNames(norm, normalizeName(r.name));
          if (!match) continue;
          const target = { kind: 'client' };
          const level = levelFor(subjectRole, target, match, singleToken && match !== 'national_id');
          push(`c${r.id}`, {
            level,
            match,
            target: 'client',
            client: { id: r.id, code: r.code, name: r.name },
            reason:
              subjectRole === 'client'
                ? 'يوجد عميل آخر مسجل بنفس البيانات — تحقق من عدم تكرار الملف'
                : subjectRole === 'opponent'
                  ? `الخصم في هذا الملف قد يكون المستفيد ${r.code} لدى المؤسسة`
                  : `الطرف قد يكون المستفيد ${r.code} لدى المؤسسة`,
          });
        }
      }
    }

    const pconds = [];
    const pparams = [];
    if (nid) {
      pconds.push('p.national_id = ?');
      pparams.push(nid);
    }
    if (usableName) {
      pconds.push("(p.name_norm = ? OR p.name_norm LIKE ? OR ? LIKE p.name_norm || ' %')");
      pparams.push(norm, `${norm} %`, norm);
    }
    if (pconds.length) {
      const rows = db.all(
        `SELECT p.*, c.code AS case_code, m.code AS matter_code FROM case_parties p
         LEFT JOIN cases c ON c.id = p.case_id LEFT JOIN matters m ON m.id = p.matter_id
         WHERE (${pconds.join(' OR ')}) LIMIT 80`,
        ...pparams,
      );
      for (const p of rows) {
        if (excludePartyId && p.id === excludePartyId) continue;
        if ((p.case_id && fam.caseIds.includes(p.case_id)) || (p.matter_id && fam.matterIds.includes(p.matter_id))) continue;
        const match = nid && p.national_id === nid ? 'national_id' : compareNames(norm, p.name_norm);
        if (!match) continue;
        const target = { kind: 'party', role: p.role };
        const level = levelFor(subjectRole, target, match, singleToken && match !== 'national_id');
        const where = p.matter_code || p.case_code || '';
        push(`p${p.id}`, {
          level,
          match,
          target: 'party',
          party: { id: p.id, name: p.name, role: p.role, case_id: p.case_id, case_code: p.case_code, matter_id: p.matter_id, matter_code: p.matter_code },
          reason:
            subjectRole === 'client' && p.role === 'opponent'
              ? `المستفيد مسجل خصمًا في الملف ${where}`
              : subjectRole === 'opponent' && p.role === 'opponent'
                ? `نفس الخصم مسجل في الملف ${where}`
                : `الاسم مسجل بصفة «${LABELS.party_role[p.role] || p.role}» في الملف ${where}`,
        });
      }
    }
    return [...out.values()].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
  }

  function summarizeMatches(subject, matches) {
    const high = matches.filter((m) => m.level === 'high').length;
    const review = matches.filter((m) => m.level === 'review').length;
    if (!matches.length) return `فحص تعارض المصالح «${subject}»: لا يوجد تطابق`;
    const parts = [];
    if (high) parts.push(`تعارض محتمل: ${high}`);
    if (review) parts.push(`يحتاج مراجعة: ${review}`);
    const info = matches.length - high - review;
    if (info) parts.push(`للعلم: ${info}`);
    return `فحص تعارض المصالح «${subject}»: ${parts.join('، ')}`;
  }

  function logCheck({ subject, matches, case_id = null, matter_id = null, intake_id = null, client_id = null, actor, notify = false, link = null }) {
    const high = matches.filter((m) => m.level === 'high').length;
    app.activity.log({
      case_id,
      matter_id,
      intake_id,
      client_id,
      actor,
      type: 'conflict.check',
      summary: summarizeMatches(subject, matches),
      data: {
        subject,
        high,
        review: matches.filter((m) => m.level === 'review').length,
        total: matches.length,
        matches: matches.slice(0, 10).map((m) => ({ level: m.level, match: m.match, client_code: m.client?.code, party_case: m.party?.matter_code || m.party?.case_code })),
      },
    });
    if (notify && high) {
      const cm = case_id ? db.value('SELECT case_manager_id FROM cases WHERE id = ?', case_id) : null;
      app.notifications.notifyStaff(
        { type: 'conflict.alert', title: `تنبيه تعارض مصالح محتمل: «${truncate(subject, 60)}»`, body: matches[0]?.reason || null, link },
        { caseManagerId: cm || null },
      );
    }
  }

  function partyView(p, family) {
    const matches = checkConflicts({ name: p.name, national_id: p.national_id }, { subjectRole: p.role, family, excludePartyId: p.id });
    return {
      id: p.id,
      case_id: p.case_id,
      matter_id: p.matter_id,
      role: p.role,
      name: p.name,
      national_id: p.national_id,
      notes: p.notes,
      origin: p.origin,
      created_at: p.created_at,
      created_by_name: userName(p.created_by),
      matches,
    };
  }

  function validateParty(body, { partial = false } = {}) {
    const out = {};
    if (!partial || body.role !== undefined) out.role = v.oneOf(body.role, ENUMS.party_role, 'صفة الطرف', { required: true });
    if (!partial || body.name !== undefined) {
      out.name = v.str(body.name, 'اسم الطرف', { required: true, min: 2, max: 150 });
      out.name_norm = normalizeName(out.name);
      if (!out.name_norm) throw badRequest('اكتب اسمًا صالحًا للطرف');
    }
    if (!partial || body.national_id !== undefined) out.national_id = validateNationalId(body.national_id);
    if (!partial || body.notes !== undefined) out.notes = v.str(body.notes, 'ملاحظات', { max: 1000 });
    return out;
  }

  const parties = {
    list({ caseId = null, matterId = null }) {
      const fam = familyOf({ caseId, matterId });
      const rows = matterId
        ? db.all('SELECT * FROM case_parties WHERE matter_id = ? OR (case_id = ? AND matter_id IS NULL) ORDER BY id', fam.matterId, fam.caseId)
        : db.all('SELECT * FROM case_parties WHERE case_id = ? ORDER BY id', fam.caseId);
      const client = fam.clientId ? app.clients.get(fam.clientId) : null;
      const clientMatches = client?.name || client?.national_id
        ? checkConflicts({ name: client.name, national_id: client.national_id }, { subjectRole: 'client', family: fam, includeClients: false })
        : [];
      return {
        code: fam.code,
        items: rows.map((p) => partyView(p, fam)),
        client_check: client ? { client: { id: client.id, code: client.code, name: client.name }, matches: clientMatches } : null,
      };
    },

    add({ caseId = null, matterId = null }, body, actor) {
      const fam = familyOf({ caseId, matterId });
      const data = validateParty(body);
      const dup = db.get(
        'SELECT id FROM case_parties WHERE name_norm = ? AND role = ? AND (case_id = ? OR (? IS NOT NULL AND matter_id = ?))',
        data.name_norm,
        data.role,
        fam.caseId,
        fam.matterId,
        fam.matterId,
      );
      if (dup) throw conflict('هذا الطرف مسجل بالفعل في الملف بنفس الصفة');
      const t = nowIso();
      const id = db.tx(() => {
        const pid = db.insert('case_parties', { case_id: fam.caseId, matter_id: fam.matterId, ...data, origin: 'staff', created_by: actor.id, created_at: t, updated_at: t });
        const p = db.get('SELECT * FROM case_parties WHERE id = ?', pid);
        const matches = checkConflicts({ name: p.name, national_id: p.national_id }, { subjectRole: p.role, family: fam, excludePartyId: p.id });
        logCheck({ subject: p.name, matches, case_id: fam.caseId, matter_id: fam.matterId, actor });
        return pid;
      });
      return partyView(db.get('SELECT * FROM case_parties WHERE id = ?', id), fam);
    },

    update(partyId, body, actor) {
      const p = db.get('SELECT * FROM case_parties WHERE id = ?', partyId);
      if (!p) throw notFound('الطرف غير موجود');
      const data = validateParty(body, { partial: true });
      if (!Object.keys(data).length) throw badRequest('لا توجد تعديلات');
      // الخصم المأخوذ من بيانات الدعوى يبقى مطابقًا لحقل «الخصم» في الملف المستمر
      const fromMatter = p.origin === 'matter_opponent' && p.matter_id;
      if (fromMatter && data.role !== undefined && data.role !== 'opponent') {
        throw badRequest('هذا الطرف هو الخصم المسجل في بيانات الدعوى، ولا تتغير صفته من هنا. عدّل حقل «الخصم» في بيانات الملف المستمر.');
      }
      const fam = familyOf({ caseId: p.case_id, matterId: p.matter_id });
      db.tx(() => {
        db.update('case_parties', p.id, { ...data, updated_at: nowIso() });
        if (fromMatter && data.name !== undefined && data.name !== p.name) {
          db.update('matters', p.matter_id, { opponent: data.name, updated_at: nowIso() });
        }
        if (data.name !== undefined || data.national_id !== undefined || data.role !== undefined) {
          const np = db.get('SELECT * FROM case_parties WHERE id = ?', p.id);
          const matches = checkConflicts({ name: np.name, national_id: np.national_id }, { subjectRole: np.role, family: fam, excludePartyId: np.id });
          logCheck({ subject: np.name, matches, case_id: fam.caseId, matter_id: fam.matterId, actor });
        }
      });
      return partyView(db.get('SELECT * FROM case_parties WHERE id = ?', p.id), fam);
    },

    remove(partyId, actor) {
      const p = db.get('SELECT * FROM case_parties WHERE id = ?', partyId);
      if (!p) throw notFound('الطرف غير موجود');
      if (p.origin === 'matter_opponent' && p.matter_id && db.value('SELECT opponent FROM matters WHERE id = ?', p.matter_id)) {
        throw conflict('هذا الطرف هو الخصم المسجل في بيانات الدعوى. احذفه أو عدّله من حقل «الخصم» في بيانات الملف المستمر حتى يبقى الفحص مطابقًا لها.');
      }
      db.tx(() => {
        db.run('DELETE FROM case_parties WHERE id = ?', p.id);
        app.activity.log({ case_id: p.case_id, matter_id: p.matter_id, actor, type: 'party.removed', summary: `حُذف الطرف «${p.name}» (${LABELS.party_role[p.role] || p.role}) من أطراف الملف` });
      });
      return { ok: true };
    },

    /** مزامنة «الخصم» في بيانات الملف المستمر مع جدول الأطراف وفحصه (يُستدعى عند إنشاء الملف أو تعديله) */
    syncMatterOpponent(matterId, actor) {
      try {
        const m = db.get('SELECT * FROM matters WHERE id = ?', matterId);
        if (!m) return null;
        const name = String(m.opponent || '').trim();
        const existing = db.get("SELECT * FROM case_parties WHERE matter_id = ? AND origin = 'matter_opponent'", m.id);
        if (!name) {
          if (existing) db.run('DELETE FROM case_parties WHERE id = ?', existing.id);
          return null;
        }
        if (existing && existing.name === name) return null;
        const t = nowIso();
        const norm = normalizeName(name);
        let pid;
        if (existing) {
          db.update('case_parties', existing.id, { name, name_norm: norm, updated_at: t });
          pid = existing.id;
        } else {
          pid = db.insert('case_parties', { case_id: m.case_id, matter_id: m.id, role: 'opponent', name, name_norm: norm, origin: 'matter_opponent', created_by: actor?.id ?? null, created_at: t, updated_at: t });
        }
        const fam = familyOf({ matterId: m.id });
        const matches = checkConflicts({ name }, { subjectRole: 'opponent', family: fam, excludePartyId: pid });
        logCheck({ subject: name, matches, case_id: m.case_id, matter_id: m.id, actor, notify: true, link: `#/matters/${m.id}` });
        return matches;
      } catch (e) {
        app.log('practice.syncMatterOpponent', e);
        return null;
      }
    },

    /** فحص العميل عند فتح ملف جديد له (تحويل الطلب): هل هو خصم في ملف آخر لدى المؤسسة؟ */
    onCaseCreated(caseRow, actor) {
      try {
        const c = caseRow && db.get('SELECT * FROM cases WHERE id = ?', caseRow.id);
        if (!c) return null;
        const client = app.clients.get(c.client_id);
        if (!client || (!client.name && !client.national_id)) return null;
        const fam = familyOf({ caseId: c.id });
        const matches = checkConflicts({ name: client.name, national_id: client.national_id }, { subjectRole: 'client', family: fam, includeClients: false });
        logCheck({ subject: client.name || client.code, matches, case_id: c.id, intake_id: c.intake_id, client_id: c.client_id, actor, notify: true, link: `#/cases/${c.id}` });
        return matches;
      } catch (e) {
        app.log('practice.onCaseCreated', e);
        return null;
      }
    },
  };

  const conflicts = {
    check: checkConflicts,
    /** بحث يدوي من صفحة «فحص تعارض المصالح» (يُسجل في السجل) */
    search(body, actor) {
      const name = v.str(body.name, 'الاسم', { max: 150 });
      const nidRaw = v.str(body.national_id, 'الرقم القومي', { max: 20 });
      if (!name && !nidRaw) throw badRequest('اكتب اسمًا أو رقمًا قوميًا للبحث');
      const nid = nidRaw ? validateNationalId(nidRaw) : null;
      if (name && normalizeName(name).length < 2) throw badRequest('الاسم قصير جدًا للبحث');
      const role = v.oneOf(body.as, ['client', 'opponent'], 'صفة البحث') || 'client';
      const matches = checkConflicts({ name: name || '', national_id: nid }, { subjectRole: role });
      app.activity.log({
        actor,
        type: 'conflict.search',
        summary: summarizeMatches(name || `رقم قومي ينتهي بـ ${nid.slice(-4)}`, matches),
        data: { role, total: matches.length, high: matches.filter((m) => m.level === 'high').length },
      });
      return { query: { name, national_id: nid ? `••••${nid.slice(-4)}` : null, as: role }, generic: !!name && isGenericName(normalizeName(name)), matches };
    },
    /** آخر نتائج الفحص التي وُجد فيها تطابق (من السجل) */
    recent({ limit = 30 } = {}) {
      return db
        .all(
          `SELECT a.id, a.case_id, a.matter_id, a.intake_id, a.summary, a.data, a.created_at, u.name AS actor_name,
             c.code AS case_code, m.code AS matter_code
           FROM activity a LEFT JOIN users u ON u.id = a.actor_user_id
           LEFT JOIN cases c ON c.id = a.case_id LEFT JOIN matters m ON m.id = a.matter_id
           WHERE a.type IN ('conflict.check','conflict.search') AND COALESCE(json_extract(a.data, '$.total'), 0) > 0
           ORDER BY a.id DESC LIMIT ?`,
          Math.min(Number(limit) || 30, 100),
        )
        .map((r) => {
          const d = parseJson(r.data, {});
          return { id: r.id, case_id: r.case_id, case_code: r.case_code, matter_id: r.matter_id, matter_code: r.matter_code, summary: r.summary, high: d.high || 0, review: d.review || 0, total: d.total || 0, actor_name: r.actor_name, created_at: r.created_at };
        });
    },
  };

  // ═══════════════════════ 4) التقويم واشتراك ICS ═══════════════════════

  function rangeOf(query, { defaultDays = 45, maxDays = 400 } = {}) {
    const from = v.iso(query.from, 'من تاريخ') || addDays(nowIso(), -7);
    const to = v.iso(query.to, 'إلى تاريخ') || addDays(from, defaultDays);
    if (to <= from) throw badRequest('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
    if ((Date.parse(to) - Date.parse(from)) / 86400000 > maxDays) throw badRequest(`المدى الزمني أطول من المسموح (${arabicCount(maxDays, ['يوم', 'يومين', 'أيام', 'يومًا'])})`);
    return { from, to };
  }

  function parseTypes(raw) {
    const all = ENUMS.calendar_type;
    if (!raw) return all;
    const list = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
    const out = list.filter((x) => all.includes(x));
    return out.length ? out : all;
  }

  /**
   * عناصر التقويم. viewer: مستخدم الإدارة أو المحامي. للمحامي: ملفاته المستمرة ومهامه ومواعيد إسناداته فقط.
   */
  function calendarItems({ from, to, types, lawyerId = null }, viewer) {
    const isLawyer = viewer.role === 'lawyer';
    const lid = isLawyer ? viewer.id : lawyerId;
    const t = nowIso();
    const items = [];
    const lawyerNames = new Map();
    const lname = (id) => {
      if (!id) return null;
      if (!lawyerNames.has(id)) lawyerNames.set(id, app.cases.lawyerName(id) || null);
      return lawyerNames.get(id);
    };

    if (types.includes('event')) {
      const rows = db.all(
        `SELECT e.id, e.kind, e.title, e.starts_at, e.location, e.status, e.client_attendance_required, m.id AS matter_id, m.code AS matter_code,
           m.responsible_lawyer_id, m.court
         FROM matter_events e JOIN matters m ON m.id = e.matter_id
         WHERE e.starts_at >= ? AND e.starts_at < ? AND e.status != 'cancelled' ${lid ? 'AND m.responsible_lawyer_id = ?' : ''}
         ORDER BY e.starts_at`,
        from,
        to,
        ...(lid ? [lid] : []),
      );
      for (const e of rows) {
        items.push({
          uid: `event-${e.id}`,
          type: 'event',
          kind: e.kind,
          title: e.title,
          starts_at: e.starts_at,
          all_day: false,
          status: e.status,
          overdue: false,
          location: e.location,
          client_attendance_required: !!e.client_attendance_required,
          ref: { kind: 'matter', id: e.matter_id, code: e.matter_code },
          link: isLawyer ? `#/my/matters/${e.matter_id}` : `#/matters/${e.matter_id}`,
          lawyer: isLawyer ? null : e.responsible_lawyer_id ? { id: e.responsible_lawyer_id, name: lname(e.responsible_lawyer_id) } : null,
        });
      }
    }
    if (types.includes('task')) {
      const rows = db.all(
        `SELECT k.id, k.title, k.due_at, k.status, k.procedural, k.assignee_user_id, m.id AS matter_id, m.code AS matter_code, m.responsible_lawyer_id
         FROM matter_tasks k JOIN matters m ON m.id = k.matter_id
         WHERE k.due_at IS NOT NULL AND k.due_at >= ? AND k.due_at < ? AND k.status != 'cancelled'
           ${lid ? 'AND (m.responsible_lawyer_id = ? OR k.assignee_user_id = ?)' : ''}
         ORDER BY k.due_at`,
        from,
        to,
        ...(lid ? [lid, lid] : []),
      );
      for (const k of rows) {
        // المحامي لا يرى مهام ملف لم يعد مسؤولًا عنه حتى لو كانت مسندة إليه سابقًا
        if (isLawyer && k.responsible_lawyer_id !== viewer.id) continue;
        items.push({
          uid: `task-${k.id}`,
          type: 'task',
          kind: k.procedural ? 'procedural' : 'task',
          title: k.title,
          starts_at: k.due_at,
          all_day: true,
          status: k.status,
          overdue: k.status === 'open' && k.due_at < t,
          ref: { kind: 'matter', id: k.matter_id, code: k.matter_code },
          link: isLawyer ? `#/my/matters/${k.matter_id}` : `#/matters/${k.matter_id}`,
          lawyer: isLawyer ? null : k.assignee_user_id ? { id: k.assignee_user_id, name: userName(k.assignee_user_id) } : null,
        });
      }
    }
    if (types.includes('assignment')) {
      const rows = db.all(
        `SELECT a.id, a.due_at, a.status, a.role, a.lawyer_id, c.id AS case_id, c.code AS case_code, c.title AS case_title
         FROM assignments a JOIN cases c ON c.id = a.case_id
         WHERE a.due_at IS NOT NULL AND a.due_at >= ? AND a.due_at < ? AND a.status IN ('assigned','in_progress','returned','submitted')
           AND c.status != 'closed' ${lid ? 'AND a.lawyer_id = ?' : ''}
         ORDER BY a.due_at`,
        from,
        to,
        ...(lid ? [lid] : []),
      );
      for (const a of rows) {
        items.push({
          uid: `assignment-${a.id}`,
          type: 'assignment',
          kind: a.role,
          title: isLawyer ? `تسليم الإسناد: ${a.case_title}` : `تسليم إسناد (${LABELS.assignment_role[a.role]}) — ${lname(a.lawyer_id) || ''}`.trim(),
          starts_at: a.due_at,
          all_day: false,
          status: a.status,
          overdue: ['assigned', 'in_progress', 'returned'].includes(a.status) && a.due_at < t,
          ref: { kind: 'case', id: a.case_id, code: a.case_code },
          link: isLawyer ? `#/my/assignments/${a.id}` : `#/cases/${a.case_id}?tab=team`,
          lawyer: isLawyer ? null : { id: a.lawyer_id, name: lname(a.lawyer_id) },
        });
      }
    }
    if (types.includes('invoice') && !isLawyer) {
      const rows = db.all(
        `SELECT i.id, i.number, i.description, i.amount_minor, i.due_at, i.status, i.matter_id, m.code AS matter_code, m.responsible_lawyer_id,
           (SELECT COALESCE(SUM(p.amount_minor), 0) FROM payments p WHERE p.invoice_id = i.id) AS paid_minor
         FROM invoices i LEFT JOIN matters m ON m.id = i.matter_id
         WHERE i.due_at >= ? AND i.due_at < ? AND i.status IN ('unpaid','partially_paid') ${lid ? 'AND m.responsible_lawyer_id = ?' : ''}
         ORDER BY i.due_at`,
        from,
        to,
        ...(lid ? [lid] : []),
      );
      for (const i of rows) {
        items.push({
          uid: `invoice-${i.id}`,
          type: 'invoice',
          kind: 'invoice',
          title: `استحقاق الفاتورة ${i.number}: ${truncate(i.description, 60)}`,
          starts_at: i.due_at,
          all_day: true,
          status: i.status,
          overdue: i.due_at < t,
          amount: fromMinor(i.amount_minor - Number(i.paid_minor)),
          ref: i.matter_id ? { kind: 'matter', id: i.matter_id, code: i.matter_code } : null,
          link: i.matter_id ? `#/matters/${i.matter_id}?tab=invoices` : null,
          lawyer: null,
        });
      }
    }
    items.sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0));
    return items;
  }

  /** المتأخرات المفتوحة أيًا كان تاريخها (لعرضها أعلى جدول المواعيد) */
  function overdueItems(viewer, { lawyerId = null, types }) {
    const t = nowIso();
    return calendarItems({ from: addDays(t, -365), to: t, types: types.filter((x) => x !== 'event'), lawyerId }, viewer).filter((x) => x.overdue).slice(-50);
  }

  /** هل أُبطل رابط التقويم بتغيير كلمة المرور أو بتعيين كلمة مرور مؤقتة بعد إصداره؟ */
  function feedInvalidated(user, feed) {
    if (!user || !feed) return false;
    if (user.must_change_password) return true;
    return !!(user.password_changed_at && feed.created_at && user.password_changed_at > feed.created_at);
  }

  function feedBaseUrl(ctx) {
    if (app.config.publicBaseUrl) return app.config.publicBaseUrl;
    const proto = process.env.TRUST_PROXY === '1' && ctx?.req?.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = (process.env.TRUST_PROXY === '1' && ctx?.req?.headers['x-forwarded-host']) || ctx?.req?.headers.host || 'localhost';
    return `${proto}://${host}`;
  }

  const calendar = {
    rangeOf,
    parseTypes,
    items: calendarItems,
    forStaff(query, viewer) {
      const { from, to } = rangeOf(query);
      const types = parseTypes(query.types);
      const lawyerId = query.lawyer_id ? v.int(query.lawyer_id, 'المحامي', { min: 1 }) : null;
      return {
        from,
        to,
        types,
        items: calendarItems({ from, to, types, lawyerId }, viewer),
        overdue: overdueItems(viewer, { lawyerId, types }),
        lawyers: db.all("SELECT u.id, u.name, l.title FROM users u JOIN lawyers l ON l.user_id = u.id WHERE u.role = 'lawyer' AND u.active = 1 ORDER BY u.name").map((r) => ({ id: r.id, name: `${r.title || ''} ${r.name}`.trim() })),
      };
    },
    forLawyer(query, lawyer) {
      const { from, to } = rangeOf(query);
      const types = parseTypes(query.types).filter((x) => x !== 'invoice');
      return { from, to, types, items: calendarItems({ from, to, types }, lawyer), overdue: overdueItems(lawyer, { types }) };
    },

    feedStatus(user, ctx) {
      let r = db.get('SELECT * FROM calendar_feeds WHERE user_id = ?', user.id);
      let invalidated = null;
      if (r && feedInvalidated(db.get('SELECT * FROM users WHERE id = ?', user.id), r)) {
        db.run('DELETE FROM calendar_feeds WHERE user_id = ?', user.id);
        r = null;
        invalidated = 'password_changed';
      }
      return {
        active: !!r,
        invalidated,
        created_at: r?.created_at ?? null,
        last_used_at: r?.last_used_at ?? null,
        use_count: r?.use_count ?? 0,
        hint: r?.token_hint ?? null,
        scope: user.role === 'lawyer' ? 'lawyer' : 'staff',
        base_url: feedBaseUrl(ctx),
      };
    },
    /** إصدار رابط جديد (يُبطل القديم). الرابط الكامل لا يُعرض إلا مرة واحدة الآن */
    issueFeed(user, ctx) {
      const token = randomToken(24);
      const t = nowIso();
      db.run(
        `INSERT INTO calendar_feeds (user_id, token_hash, token_hint, created_at, use_count) VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(user_id) DO UPDATE SET token_hash = excluded.token_hash, token_hint = excluded.token_hint, created_at = excluded.created_at, last_used_at = NULL, use_count = 0`,
        user.id,
        sha256(token),
        token.slice(-4),
        t,
      );
      app.audit.log({ actor: user, ctx, type: 'calendar.feed_issued', summary: 'أُصدر رابط اشتراك تقويم جديد (أُبطل أي رابط سابق)' });
      const url = `${feedBaseUrl(ctx)}/api/calendar/${token}.ics`;
      return { ...calendar.feedStatus(user, ctx), url, webcal_url: url.replace(/^https?:\/\//, 'webcal://') };
    },
    revokeFeed(user, ctx) {
      const r = db.run('DELETE FROM calendar_feeds WHERE user_id = ?', user.id);
      if (r.changes) app.audit.log({ actor: user, ctx, type: 'calendar.feed_revoked', summary: 'أُلغي رابط اشتراك التقويم' });
      return calendar.feedStatus(user, ctx);
    },
    /** حالة رابط التقويم لحساب ما (لصفحة الحساب عند مدير النظام) — بدون الرمز */
    feedInfo(userId) {
      const r = db.get('SELECT created_at, last_used_at, use_count, token_hint FROM calendar_feeds WHERE user_id = ?', userId);
      if (!r) return { active: false };
      return { active: true, created_at: r.created_at, last_used_at: r.last_used_at || null, use_count: Number(r.use_count) || 0, hint: r.token_hint || null };
    },
    /**
     * إلغاء رابط التقويم لحساب: يُستدعى عند إنهاء كل الجلسات، وإلغاء التحقق بخطوتين (فقدان الهاتف)،
     * وتغيير الدور أو إيقاف الحساب، ومن صفحة الحساب عند الإدارة. reason يظهر في سجل الأمان. يعيد true إن وُجد رابط.
     */
    revokeFeedFor(userId, actor, ctx, reason) {
      const r = db.run('DELETE FROM calendar_feeds WHERE user_id = ?', userId);
      if (!r.changes) return false;
      const target = db.get('SELECT name, username FROM users WHERE id = ?', userId);
      const self = actor && actor.id === userId;
      app.audit.log({
        actor,
        ctx,
        type: 'calendar.feed_revoked',
        severity: self ? 'info' : 'warning',
        summary: `إلغاء رابط اشتراك التقويم${self ? '' : ` لحساب ${target?.name || ''}${target?.username ? ` (${target.username})` : ''}`} — ${reason}`,
        data: { target_user_id: userId, reason },
      });
      return true;
    },
    /** محتوى ملف ICS لرمز صالح، أو null (لرمز غير صالح أو حساب موقوف) */
    renderFeed(token, ctx) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 100 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
      const feed = db.get('SELECT * FROM calendar_feeds WHERE token_hash = ?', sha256(token));
      if (!feed) return null;
      const user = db.get('SELECT * FROM users WHERE id = ?', feed.user_id);
      if (!user || !user.active) return null;
      // كلمة مرور مؤقتة (استعادة حساب) أو تغيير كلمة المرور بعد إصدار الرابط: يتوقف الرابط كما تُنهى الجلسات الأخرى
      if (feedInvalidated(user, feed)) {
        db.run('DELETE FROM calendar_feeds WHERE user_id = ? AND token_hash = ?', user.id, feed.token_hash);
        return null;
      }
      // أي تقييد آخر للحساب (مثل إلزام مديري النظام بالتحقق بخطوتين) يوقف الرابط مؤقتًا حتى يُستوفى
      try {
        if (app.auth.publicUser?.(user)?.restricted) return null;
      } catch {
        return null;
      }
      db.run('UPDATE calendar_feeds SET last_used_at = ?, use_count = use_count + 1 WHERE user_id = ?', nowIso(), user.id);
      const t = nowIso();
      const isLawyer = user.role === 'lawyer';
      const types = isLawyer ? ['event', 'task', 'assignment'] : ['event', 'task', 'assignment', 'invoice'];
      const items = calendarItems({ from: addDays(t, -60), to: addDays(t, 400), types }, user);
      const base = feedBaseUrl(ctx);
      const org = app.settings.get('org_name') || 'بيوت مصر';
      const events = items.map((it) => {
        const code = it.ref?.code ? ` (${it.ref.code})` : '';
        let summary;
        if (it.type === 'event') summary = `${LABELS.event_kind[it.kind] || 'موعد'}: ${it.title}${code}`;
        else if (it.type === 'task') summary = `${it.kind === 'procedural' ? 'موعد إجرائي' : 'مهمة'}: ${it.title}${code}`;
        else if (it.type === 'assignment') summary = `${it.title}${code}`;
        else summary = it.title;
        const desc = [
          it.type === 'event' && it.client_attendance_required ? 'يلزم حضور صاحب الشأن.' : null,
          it.status ? `الحالة: ${LABELS[it.type === 'event' ? 'event_status' : it.type === 'task' ? 'task_status' : it.type === 'assignment' ? 'assignment_status' : 'invoice_status']?.[it.status] || it.status}` : null,
          it.link ? `${base}/app${it.link}` : null,
        ].filter(Boolean).join('\n');
        return {
          uid: `${it.uid}@beyoot-legal`,
          summary,
          description: desc,
          location: it.location || null,
          start: it.starts_at,
          allDay: it.all_day,
          url: it.link ? `${base}/app${it.link}` : null,
          status: it.type === 'event' && it.status === 'postponed' ? 'TENTATIVE' : 'CONFIRMED',
          categories: LABELS.calendar_type[it.type],
          alarmMinutes: it.type === 'event' ? 24 * 60 : null,
        };
      });
      return buildIcs({ name: `${org} — ${isLawyer ? 'تقويمي' : 'تقويم الإدارة'}`, events, now: t });
    },
  };

  // ═══════════════════════ 5) البحث الشامل ═══════════════════════

  function likeNorm(q) {
    return `%${normalizeArabic(q).replace(/[%_]/g, '')}%`;
  }

  const search = {
    staff(qRaw) {
      const q = v.str(qRaw, 'نص البحث', { max: 100 }) || '';
      if (q.replace(/\s/g, '').length < 2) return { q, groups: [], total: 0 };
      const like = likeNorm(q);
      const codeLike = `%${q.trim().toUpperCase().replace(/[%_]/g, '')}%`;
      const digits = latinDigits(q).replace(/\D/g, '');
      const phoneQuery = digits.length >= 5 && digits.length >= q.replace(/\s/g, '').length - 2;
      // الأرقام المخزنة بصيغة +20…: نبحث بالأرقام بعد حذف 0 أو 20 في البداية
      const phoneCore = digits.replace(/^(?:0020|20|0)/, '');
      const nid = /^[23]\d{13}$/.test(digits) ? digits : null;
      const groups = [];

      // العملاء: بالاسم أو الكود أو الهاتف أو الرقم القومي
      const cParams = [];
      let cWhere;
      if (nid) {
        cWhere = 'c.national_id = ?';
        cParams.push(nid);
      } else if (phoneQuery) {
        const full = digits.length >= 10 ? normalizePhone(q) : null;
        cWhere = full
          ? "EXISTS (SELECT 1 FROM client_identities x WHERE x.client_id = c.id AND x.kind = 'phone' AND x.value = ?)"
          : "EXISTS (SELECT 1 FROM client_identities x WHERE x.client_id = c.id AND x.kind = 'phone' AND x.value LIKE ?)";
        cParams.push(full || `%${phoneCore}%`);
      } else {
        cWhere = '(practice_ar(c.name) LIKE ? OR UPPER(c.code) LIKE ?)';
        cParams.push(like, codeLike);
      }
      const clients = db.all(
        `SELECT c.id, c.code, c.name, c.governorate,
           (SELECT value FROM client_identities x WHERE x.client_id = c.id AND x.kind = 'phone' ORDER BY x.id LIMIT 1) AS phone
         FROM clients c WHERE c.merged_into IS NULL AND ${cWhere} ORDER BY c.id DESC LIMIT 6`,
        ...cParams,
      );
      if (clients.length) {
        groups.push({
          key: 'clients',
          label: 'العملاء والمستفيدون',
          items: clients.map((c) => ({ id: c.id, title: c.name || 'عميل بدون اسم', code: c.code, subtitle: [c.phone ? isoLtr(maskPhone(c.phone)) : null, c.governorate].filter(Boolean).join(' · '), href: `#/clients/${c.id}`, icon: 'user' })),
        });
      }

      const intakes = db.all(
        `SELECT i.id, i.code, i.title, i.status, i.contact_name, i.created_at FROM intakes i
         WHERE UPPER(i.code) LIKE ? OR practice_ar(i.title) LIKE ? OR practice_ar(i.contact_name) LIKE ?
           ${phoneQuery ? 'OR i.contact_phone LIKE ?' : ''}
         ORDER BY i.id DESC LIMIT 6`,
        codeLike,
        like,
        like,
        ...(phoneQuery ? [`%${phoneCore}%`] : []),
      );
      if (intakes.length) {
        groups.push({
          key: 'intakes',
          label: 'الطلبات الواردة',
          items: intakes.map((i) => ({ id: i.id, title: i.title || i.contact_name || 'طلب بدون عنوان', code: i.code, subtitle: LABELS.intake_status[i.status], href: `#/inbox/${i.id}`, icon: 'inbox' })),
        });
      }

      const cases = db.all(
        `SELECT c.id, c.code, c.title, c.status, cl.name AS client_name FROM cases c JOIN clients cl ON cl.id = c.client_id
         WHERE UPPER(c.code) LIKE ? OR practice_ar(c.title) LIKE ? OR practice_ar(cl.name) LIKE ? ORDER BY c.id DESC LIMIT 6`,
        codeLike,
        like,
        like,
      );
      if (cases.length) {
        groups.push({
          key: 'cases',
          label: 'ملفات الاستشارات',
          items: cases.map((c) => ({ id: c.id, title: c.title, code: c.code, subtitle: [LABELS.case_status[c.status], c.client_name].filter(Boolean).join(' · '), href: `#/cases/${c.id}`, icon: 'briefcase' })),
        });
      }

      const matters = db.all(
        `SELECT m.id, m.code, m.title, m.status, m.lawsuit_number, m.lawsuit_year FROM matters m
         WHERE UPPER(m.code) LIKE ? OR practice_ar(m.title) LIKE ? OR m.lawsuit_number LIKE ? OR practice_ar(m.opponent) LIKE ? ORDER BY m.id DESC LIMIT 6`,
        codeLike,
        like,
        `%${digits || q.trim()}%`,
        like,
      );
      if (matters.length) {
        groups.push({
          key: 'matters',
          label: 'الملفات المستمرة',
          items: matters.map((m) => ({ id: m.id, title: m.title, code: m.code, subtitle: [LABELS.matter_status[m.status], m.lawsuit_number ? `دعوى رقم ${m.lawsuit_number}${m.lawsuit_year ? ` لسنة ${m.lawsuit_year}` : ''}` : null].filter(Boolean).join(' · '), href: `#/matters/${m.id}`, icon: 'gavel' })),
        });
      }

      const lawyers = db.all(
        `SELECT u.id, u.name, u.username, u.active, l.title, l.specialties FROM users u JOIN lawyers l ON l.user_id = u.id
         WHERE u.role = 'lawyer' AND (practice_ar(u.name) LIKE ? OR LOWER(u.username) LIKE ?) ORDER BY u.active DESC, u.name LIMIT 6`,
        like,
        `%${q.trim().toLowerCase().replace(/[%_]/g, '')}%`,
      );
      if (lawyers.length) {
        groups.push({
          key: 'lawyers',
          label: 'المحامون',
          items: lawyers.map((l) => ({
            id: l.id,
            title: `${l.title || ''} ${l.name}`.trim(),
            code: null,
            subtitle: [parseJson(l.specialties, []).map((s) => AREA[s] || s).join('، '), l.active ? null : 'موقوف'].filter(Boolean).join(' · '),
            href: `#/lawyers/${l.id}`,
            icon: 'scale',
          })),
        });
      }
      return { q, groups, total: groups.reduce((s, g) => s + g.items.length, 0) };
    },

    /** بحث المحامي: إسناداته وملفاته المستمرة فقط — بلا أسماء عملاء أو هواتف */
    lawyer(qRaw, lawyer) {
      const q = v.str(qRaw, 'نص البحث', { max: 100 }) || '';
      if (q.replace(/\s/g, '').length < 2) return { q, groups: [], total: 0 };
      const like = likeNorm(q);
      const codeLike = `%${q.trim().toUpperCase().replace(/[%_]/g, '')}%`;
      const groups = [];
      const assignments = db.all(
        `SELECT a.id, a.role, a.status, c.code AS case_code, c.title AS case_title, c.status AS case_status FROM assignments a JOIN cases c ON c.id = a.case_id
         WHERE a.lawyer_id = ? AND a.status != 'withdrawn' AND (UPPER(c.code) LIKE ? OR practice_ar(c.title) LIKE ?)
         ORDER BY a.id DESC LIMIT 8`,
        lawyer.id,
        codeLike,
        like,
      );
      if (assignments.length) {
        groups.push({
          key: 'assignments',
          label: 'إسناداتي',
          items: assignments.map((a) => ({ id: a.id, title: a.case_title, code: a.case_code, subtitle: `${LABELS.assignment_role[a.role]} · ${LABELS.assignment_status[a.status]}`, href: `#/my/assignments/${a.id}`, icon: 'briefcase' })),
        });
      }
      const matters = db.all(
        `SELECT m.id, m.code, m.title, m.status, m.court FROM matters m
         WHERE m.responsible_lawyer_id = ? AND (UPPER(m.code) LIKE ? OR practice_ar(m.title) LIKE ? OR m.lawsuit_number LIKE ? OR practice_ar(m.court) LIKE ?)
         ORDER BY m.id DESC LIMIT 8`,
        lawyer.id,
        codeLike,
        like,
        `%${q.trim()}%`,
        like,
      );
      if (matters.length) {
        groups.push({
          key: 'matters',
          label: 'ملفاتي المستمرة',
          items: matters.map((m) => ({ id: m.id, title: m.title, code: m.code, subtitle: [LABELS.matter_status[m.status], m.court].filter(Boolean).join(' · '), href: `#/my/matters/${m.id}`, icon: 'gavel' })),
        });
      }
      return { q, groups, total: groups.reduce((s, g) => s + g.items.length, 0) };
    },
  };

  // ═══════════════════════ 6) زمن الاستجابة ومستوى الخدمة ═══════════════════════

  const sla = {
    hours() {
      const h = Number(app.settings.get('sla_first_response_hours'));
      return Number.isFinite(h) && h > 0 ? h : 4;
    },
    firstResponseAt(intakeId) {
      return db.value(`SELECT ${FIRST_RESPONSE_SQL} FROM intakes i WHERE i.id = ?`, intakeId) ?? null;
    },
    /** ملخص للوحة المتابعة وتقرير الأثر */
    summary({ days = 30 } = {}) {
      const hours = sla.hours();
      const t = nowIso();
      const since = addDays(t, -days);
      const chan = SLA_CHANNELS.map(() => '?').join(',');
      const rows = db.all(
        `SELECT i.created_at, ${FIRST_RESPONSE_SQL} AS fr FROM intakes i
         WHERE i.created_at >= ? AND i.first_channel IN (${chan}) AND i.status != 'archived'`,
        since,
        ...SLA_CHANNELS,
      );
      const waits = rows.filter((r) => r.fr).map((r) => (Date.parse(r.fr) - Date.parse(r.created_at)) / 60000).sort((a, b) => a - b);
      const avg = waits.length ? Math.round(waits.reduce((s, x) => s + x, 0) / waits.length) : null;
      const median = waits.length ? Math.round(waits.length % 2 ? waits[(waits.length - 1) / 2] : (waits[waits.length / 2 - 1] + waits[waits.length / 2]) / 2) : null;
      const within = waits.filter((w) => w <= hours * 60).length;
      const overdue = sla.overdue({ limit: 20 });
      return {
        hours,
        days,
        responded: waits.length,
        total: rows.length,
        avg_minutes: avg,
        median_minutes: median,
        within_sla_rate: waits.length ? Math.round((within / waits.length) * 1000) / 1000 : null,
        overdue_now: overdue.total,
        overdue: overdue.items,
        alerts_enabled: app.settings.get('sla_alerts_enabled') !== false,
      };
    },
    /** طلبات مفتوحة تجاوزت مهلة أول رد دون أي رد من الإدارة */
    overdue({ limit = 50 } = {}) {
      const hours = sla.hours();
      const cutoff = addHours(nowIso(), -hours);
      const chan = SLA_CHANNELS.map(() => '?').join(',');
      const base = `FROM intakes i WHERE i.status IN ('new','in_review','awaiting_client') AND i.first_channel IN (${chan})
        AND i.created_at <= ? AND ${FIRST_RESPONSE_SQL} IS NULL`;
      const total = Number(db.value(`SELECT COUNT(*) ${base}`, ...SLA_CHANNELS, cutoff));
      const items = db
        .all(`SELECT i.id, i.code, i.title, i.contact_name, i.priority, i.first_channel, i.created_at, i.sla_alerted_at, i.assigned_staff_id ${base} ORDER BY i.created_at LIMIT ?`, ...SLA_CHANNELS, cutoff, limit)
        .map((r) => ({ ...r, waited_minutes: Math.round((Date.parse(nowIso()) - Date.parse(r.created_at)) / 60000) }));
      return { total, items };
    },
    /** المهمة الدورية: تنبيه الإدارة مرة واحدة لكل طلب تجاوز المهلة */
    run() {
      if (app.settings.get('sla_alerts_enabled') === false) return { skipped: 'disabled', alerted: 0 };
      const hours = sla.hours();
      const cutoff = addHours(nowIso(), -hours);
      const chan = SLA_CHANNELS.map(() => '?').join(',');
      const rows = db.all(
        `SELECT i.id, i.code, i.title, i.contact_name, i.client_id, i.created_at, i.assigned_staff_id FROM intakes i
         WHERE i.status IN ('new','in_review','awaiting_client') AND i.first_channel IN (${chan}) AND i.sla_alerted_at IS NULL
           AND i.created_at <= ? AND ${FIRST_RESPONSE_SQL} IS NULL ORDER BY i.created_at LIMIT 200`,
        ...SLA_CHANNELS,
        cutoff,
      );
      const t = nowIso();
      let alerted = 0;
      const batched = [];
      for (const r of rows) {
        // تحديث مشروط: لا يُرسل التنبيه مرتين حتى لو تزامن تشغيلان
        const ok = db.run('UPDATE intakes SET sla_alerted_at = ? WHERE id = ? AND sla_alerted_at IS NULL', t, r.id);
        if (!ok.changes) continue;
        alerted++;
        app.activity.log({ intake_id: r.id, client_id: r.client_id, actor: { kind: 'system' }, type: 'intake.sla_breach', summary: `تجاوز الطلب مهلة أول رد (${arabicCount(hours, AR_UNITS.hour)}) دون رد من الإدارة` });
        // أول تشغيل بعد التفعيل (أو بعد انقطاع) قد يجد عشرات الطلبات القديمة: تنبيه مستقل لأول عشرة، وتنبيه مجمّع للباقي
        if (alerted > SLA_INDIVIDUAL_ALERTS) {
          batched.push(r);
          continue;
        }
        const waited = Math.round((Date.parse(t) - Date.parse(r.created_at)) / 3600000);
        app.notifications.notifyStaff(
          {
            type: 'intake.sla_breach',
            title: `الطلب ${r.code} بلا رد منذ ${arabicCount(Math.max(1, waited), AR_UNITS.hour)} (المهلة ${arabicCount(hours, AR_UNITS.hour)})`,
            body: truncate(r.title || r.contact_name || '', 120) || null,
            link: `#/inbox/${r.id}`,
          },
          { caseManagerId: r.assigned_staff_id || null },
        );
      }
      if (batched.length) {
        app.notifications.notifyStaff({
          type: 'intake.sla_breach',
          title: `طلبات أخرى بلا رد بعد مهلة ${arabicCount(hours, AR_UNITS.hour)}: ${batched.length}`,
          body: truncate(batched.slice(0, 6).map((r) => r.code).join('، '), 200),
          link: '#/inbox',
        });
      }
      return { alerted, notified: alerted - batched.length + (batched.length ? 1 : 0), checked: rows.length, hours };
    },
  };

  app.jobs.register('practice.sla', { everyMinutes: 15, label: 'تنبيه الطلبات المتأخرة عن مهلة أول رد', run: async () => sla.run() });

  // ═══════════════════════ 7) تقرير الأثر ═══════════════════════

  function impactRange(query) {
    const t = nowIso();
    const p = cairoParts(t);
    const from = v.iso(query.from, 'من تاريخ') || cairoLocalToIso(p.year, 1, 1, 0, 0);
    const to = v.iso(query.to, 'إلى تاريخ') || t;
    if (to <= from) throw badRequest('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
    if ((Date.parse(to) - Date.parse(from)) / 86400000 > 3700) throw badRequest('المدى الزمني أطول من المسموح (عشر سنوات)');
    const area = query.area ? v.oneOf(query.area, AREA_CODES, 'المجال القانوني') : null;
    const governorate = query.governorate ? v.oneOf(query.governorate, GOVERNORATES, 'المحافظة') : null;
    return { from, to, area, governorate };
  }

  function satisfaction(from, to) {
    try {
      const cols = db.all('PRAGMA table_info(case_feedback)').map((r) => r.name);
      if (!cols.length) return null;
      const col = ['rating', 'score', 'stars', 'satisfaction'].find((c) => cols.includes(c));
      if (!col) return null;
      const timeFilter = cols.includes('created_at') ? 'WHERE created_at >= ? AND created_at < ?' : '';
      const row = db.raw.prepare(`SELECT COUNT(${col}) AS n, AVG(${col}) AS avg, MAX(${col}) AS mx FROM case_feedback ${timeFilter}`).get(...(timeFilter ? [from, to] : []));
      if (!row || !Number(row.n)) return { count: 0, average: null, scale: 5 };
      const scale = Number(row.mx) > 5 ? 10 : 5;
      return { count: Number(row.n), average: Math.round(Number(row.avg) * 10) / 10, scale };
    } catch {
      return null;
    }
  }

  function monthsBetween(from, to) {
    const out = [];
    let p = periodOf(from);
    const last = periodOf(to);
    let guard = 0;
    while (p <= last && guard++ < 130) {
      out.push(p);
      const [y, m] = p.split('-').map(Number);
      p = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    }
    return out;
  }

  function periodLabel(period) {
    const [y, m] = period.split('-').map(Number);
    return `${MONTHS_AR[m - 1]} ${y}`;
  }

  const impact = {
    range: impactRange,
    report(query) {
      const { from, to, area, governorate } = impactRange(query);
      const iF = [];
      const iP = [];
      if (area) {
        iF.push('i.legal_area = ?');
        iP.push(area);
      }
      if (governorate) {
        iF.push('(cl.governorate = ? OR (cl.governorate IS NULL AND i.governorate = ?))');
        iP.push(governorate, governorate);
      }
      const cF = [];
      const cP = [];
      if (area) {
        cF.push('c.legal_area = ?');
        cP.push(area);
      }
      if (governorate) {
        cF.push('cl.governorate = ?');
        cP.push(governorate);
      }
      const and = (arr) => (arr.length ? ` AND ${arr.join(' AND ')}` : '');

      // الطلبات الواردة في الفترة (دون الرسائل الدعائية المؤرشفة)
      const intakes = db.all(
        `SELECT i.id, i.client_id, i.status, i.legal_area, i.created_at, i.first_channel, COALESCE(cl.governorate, i.governorate) AS gov, ${FIRST_RESPONSE_SQL} AS fr
         FROM intakes i LEFT JOIN clients cl ON cl.id = i.client_id
         WHERE i.created_at >= ? AND i.created_at < ? AND i.status != 'archived'${and(iF)}`,
        from,
        to,
        ...iP,
      );
      const casesOpened = db.all(
        `SELECT c.id, c.client_id, c.legal_area, c.created_at, cl.governorate AS gov FROM cases c JOIN clients cl ON cl.id = c.client_id
         WHERE c.created_at >= ? AND c.created_at < ?${and(cF)}`,
        from,
        to,
        ...cP,
      );
      const casesClosed = db.all(
        `SELECT c.id, c.client_id, c.legal_area, c.outcome, c.closed_at, c.created_at, cl.governorate AS gov,
           c.outcome_kind, c.recovered_one_time_minor, c.recovered_monthly_minor,
           EXISTS (SELECT 1 FROM matters mm WHERE mm.case_id = c.id AND mm.outcome_kind IS NOT NULL) AS matter_has_value
         FROM cases c JOIN clients cl ON cl.id = c.client_id
         WHERE c.status = 'closed' AND c.closed_at >= ? AND c.closed_at < ?${and(cF)}`,
        from,
        to,
        ...cP,
      );
      // قيمة الأثر: من ملفات الاستشارة المغلقة في الفترة، ومن الملفات المستمرة (تاريخ الإغلاق أو تاريخ تسجيل الأثر).
      // إذا سُجّل أثر للملف المستمر الناشئ عن الاستشارة فهو المعتمد، ولا يُحتسب أثر الاستشارة نفسها حتى لا يُحسب الحق مرتين.
      const caseValues = casesClosed.filter((c) => c.outcome_kind && !Number(c.matter_has_value));
      const matterValues = db.all(
        `SELECT m.id, m.client_id, c.legal_area, cl.governorate AS gov, m.outcome_kind, m.recovered_one_time_minor, m.recovered_monthly_minor,
           COALESCE(m.closed_at, m.outcome_value_at) AS at
         FROM matters m JOIN cases c ON c.id = m.case_id JOIN clients cl ON cl.id = m.client_id
         WHERE m.outcome_kind IS NOT NULL AND COALESCE(m.closed_at, m.outcome_value_at) >= ? AND COALESCE(m.closed_at, m.outcome_value_at) < ?${and(cF)}`,
        from,
        to,
        ...cP,
      );
      const values = [
        ...caseValues.map((c) => ({ ...c, at: c.closed_at, source: 'case' })),
        ...matterValues.map((m) => ({ ...m, source: 'matter' })),
      ];

      // الأسر المخدومة: عملاء لهم طلب أو ملف في الفترة
      const served = new Set([...intakes.map((i) => i.client_id), ...casesOpened.map((c) => c.client_id), ...casesClosed.map((c) => c.client_id)].filter(Boolean));
      const servedIds = [...served];
      const profiles = servedIds.length
        ? db.all(`SELECT * FROM beneficiary_profiles WHERE client_id IN (${servedIds.map(() => '?').join(',')})`, ...servedIds).map(mapProfile)
        : [];
      const year = cairoParts(to).year;
      const relation = Object.fromEntries(ENUMS.beneficiary_relation.map((k) => [k, 0]));
      let children = 0;
      let minors = 0;
      let verified = 0;
      let foundation = 0;
      for (const p of profiles) {
        if (p.relation) relation[p.relation] = (relation[p.relation] || 0) + 1;
        children += Number(p.children_count) || 0;
        minors += vulnerabilityScore(p, { year })?.minors || 0;
        if (p.verified) verified++;
        if (p.is_foundation_beneficiary) foundation++;
      }

      const sumMinor = (arr, k) => arr.reduce((s, x) => s + (Number(x[k]) || 0), 0);
      const oneTime = sumMinor(values, 'recovered_one_time_minor');
      const monthly = sumMinor(values, 'recovered_monthly_minor');
      const byKind = ENUMS.outcome_kind.map((k) => {
        const rows = values.filter((x) => x.outcome_kind === k);
        const o = sumMinor(rows, 'recovered_one_time_minor');
        const mo = sumMinor(rows, 'recovered_monthly_minor');
        return { key: k, label: LABELS.outcome_kind[k], count: rows.length, one_time: fromMinor(o), monthly: fromMinor(mo), annualized: fromMinor(o + mo * 12) };
      }).filter((x) => x.count);

      // التوزيع حسب المجال والمحافظة والشهر
      const groupBy = (keyOf, labelOf) => {
        const map = new Map();
        const g = (k) => {
          if (!map.has(k)) map.set(k, { key: k, label: labelOf(k), clients: new Set(), intakes: 0, closed: 0, one_time_minor: 0, monthly_minor: 0 });
          return map.get(k);
        };
        for (const i of intakes) {
          const x = g(keyOf(i));
          x.intakes++;
          if (i.client_id) x.clients.add(i.client_id);
        }
        for (const c of casesOpened) if (c.client_id) g(keyOf(c)).clients.add(c.client_id);
        for (const c of casesClosed) {
          const x = g(keyOf(c));
          x.closed++;
          if (c.client_id) x.clients.add(c.client_id);
        }
        for (const val of values) {
          const x = g(keyOf(val));
          x.one_time_minor += Number(val.recovered_one_time_minor) || 0;
          x.monthly_minor += Number(val.recovered_monthly_minor) || 0;
        }
        return [...map.values()]
          .map((x) => ({ key: x.key, label: x.label, families: x.clients.size, intakes: x.intakes, closed: x.closed, one_time: fromMinor(x.one_time_minor), monthly: fromMinor(x.monthly_minor), annualized: fromMinor(x.one_time_minor + x.monthly_minor * 12) }))
          .sort((a, b) => b.families - a.families || b.annualized - a.annualized);
      };
      const byArea = groupBy((x) => x.legal_area || 'GEN', (k) => AREA[k] || k);
      const byGovernorate = groupBy((x) => x.gov || '—', (k) => (k === '—' ? 'غير محددة' : k));
      const months = monthsBetween(from, to).slice(-24);
      const monthMap = new Map(months.map((m) => [m, { key: m, label: periodLabel(m), intakes: 0, closed: 0, families: new Set(), one_time_minor: 0, monthly_minor: 0 }]));
      for (const i of intakes) {
        const x = monthMap.get(periodOf(i.created_at));
        if (x) {
          x.intakes++;
          if (i.client_id) x.families.add(i.client_id);
        }
      }
      for (const c of casesClosed) {
        const x = monthMap.get(periodOf(c.closed_at));
        if (x) x.closed++;
      }
      for (const val of values) {
        const x = monthMap.get(periodOf(val.at));
        if (x) {
          x.one_time_minor += Number(val.recovered_one_time_minor) || 0;
          x.monthly_minor += Number(val.recovered_monthly_minor) || 0;
        }
      }
      const byMonth = [...monthMap.values()].map((x) => ({ key: x.key, label: x.label, intakes: x.intakes, closed: x.closed, families: x.families.size, one_time: fromMinor(x.one_time_minor), monthly: fromMinor(x.monthly_minor), annualized: fromMinor(x.one_time_minor + x.monthly_minor * 12) }));

      // المحامون المتطوعون وبرامج المسؤولية المجتمعية: القيمة التقديرية للساعات والاستشارات
      const vParams = [from, to];
      let vJoin = '';
      if (area || governorate) {
        vJoin = ' JOIN cases c ON c.id = b.case_id JOIN clients cl ON cl.id = c.client_id';
      }
      const vol = db.get(
        `SELECT COUNT(*) AS n, COALESCE(SUM(b.notional_minor), 0) AS notional, COUNT(DISTINCT b.lawyer_id) AS lawyers,
           COALESCE(SUM((SELECT a.hours_spent FROM assignments a WHERE a.id = b.assignment_id)), 0) AS hours
         FROM billable_events b${vJoin}
         WHERE b.treatment IN ('pro_bono','csr') AND b.created_at >= ? AND b.created_at < ?${and(cF)}`,
        ...vParams,
        ...cP,
      );

      // زمن أول رد على الطلب، وزمن الوصول لإجابة قانونية مرسلة للعميل
      const waits = intakes.filter((i) => i.fr && SLA_CHANNELS.includes(i.first_channel)).map((i) => (Date.parse(i.fr) - Date.parse(i.created_at)) / 60000);
      const answerRows = db.all(
        `SELECT c.created_at, MIN(a.sent_at) AS sent_at, i.created_at AS intake_at FROM cases c
         JOIN clients cl ON cl.id = c.client_id
         JOIN client_answers a ON a.case_id = c.id AND a.status = 'sent'
         LEFT JOIN intakes i ON i.id = c.intake_id
         WHERE c.created_at >= ? AND c.created_at < ?${and(cF)} GROUP BY c.id`,
        from,
        to,
        ...cP,
      );
      const answerDays = answerRows.filter((r) => r.sent_at).map((r) => (Date.parse(r.sent_at) - Date.parse(r.intake_at || r.created_at)) / 86400000);
      const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);

      const outcomes = Object.fromEntries(ENUMS.case_outcome.map((k) => [k, 0]));
      for (const c of casesClosed) if (c.outcome) outcomes[c.outcome] = (outcomes[c.outcome] || 0) + 1;

      const s = app.settings.all();
      return {
        from,
        to,
        filters: { area, governorate },
        org: { name: s.org_name, legal_name: s.org_legal_name || s.org_name, registration: s.org_registration || null, address: s.org_address || null, phone: s.org_phone || null },
        generated_at: nowIso(),
        totals: {
          families_served: served.size,
          intakes: intakes.length,
          handled_internally: intakes.filter((i) => i.status === 'handled_internally').length,
          converted: intakes.filter((i) => i.status === 'converted').length,
          cases_opened: casesOpened.length,
          cases_closed: casesClosed.length,
          matters_with_value: matterValues.length,
        },
        beneficiaries: {
          with_profile: profiles.length,
          verified,
          foundation_beneficiaries: foundation,
          relation: ENUMS.beneficiary_relation.map((k) => ({ key: k, label: LABELS.beneficiary_relation[k], count: relation[k] || 0 })),
          widows: relation.widow || 0,
          orphan_guardians: relation.orphan_guardian || 0,
          children,
          minors,
        },
        outcomes: ENUMS.case_outcome.map((k) => ({ key: k, label: LABELS.case_outcome[k], count: outcomes[k] || 0 })).filter((x) => x.count),
        value: {
          records: values.length,
          one_time: fromMinor(oneTime),
          monthly: fromMinor(monthly),
          annualized: fromMinor(oneTime + monthly * 12),
          by_kind: byKind,
        },
        by_area: byArea,
        by_governorate: byGovernorate,
        by_month: byMonth,
        volunteer: {
          consultations: Number(vol?.n || 0),
          lawyers: Number(vol?.lawyers || 0),
          hours: Math.round(Number(vol?.hours || 0) * 10) / 10,
          notional_value: fromMinor(Number(vol?.notional || 0)),
        },
        response: {
          first_response_avg_minutes: avg(waits) === null ? null : Math.round(avg(waits)),
          first_response_count: waits.length,
          within_sla_rate: waits.length ? Math.round((waits.filter((w) => w <= sla.hours() * 60).length / waits.length) * 1000) / 1000 : null,
          sla_hours: sla.hours(),
          answer_avg_days: avg(answerDays) === null ? null : Math.round(avg(answerDays) * 10) / 10,
          answer_count: answerDays.length,
        },
        satisfaction: satisfaction(from, to),
      };
    },

    /** تصدير التقرير CSV (أقسام متتالية يفتحها Excel) */
    csv(query) {
      const r = impact.report(query);
      const rows = [];
      const sec = (title) => rows.push({ a: title, b: '', c: '', d: '', e: '' });
      const kv = (a, b) => rows.push({ a, b, c: '', d: '', e: '' });
      sec(`${r.org.legal_name} — تقرير الأثر`);
      kv('الفترة', `${cairoDate(r.from)} إلى ${cairoDate(r.to)}`);
      if (r.filters.area) kv('المجال القانوني', AREA[r.filters.area]);
      if (r.filters.governorate) kv('المحافظة', r.filters.governorate);
      rows.push({});
      sec('المؤشرات الرئيسية');
      kv('الأسر المخدومة', r.totals.families_served);
      kv('الطلبات الواردة', r.totals.intakes);
      kv('ملفات استشارة فُتحت', r.totals.cases_opened);
      kv('ملفات استشارة أُغلقت', r.totals.cases_closed);
      kv('أرامل', r.beneficiaries.widows);
      kv('أوصياء أو كفلاء أيتام', r.beneficiaries.orphan_guardians);
      kv('عدد الأبناء في الأسر المخدومة', r.beneficiaries.children);
      kv('قيمة الحقوق المستردة دفعة واحدة (ج.م)', r.value.one_time);
      kv('قيمة الحقوق الشهرية المستردة (ج.م)', r.value.monthly);
      kv('القيمة السنوية للحقوق المستردة (ج.م)', r.value.annualized);
      kv('استشارات تطوعية ومسؤولية مجتمعية', r.volunteer.consultations);
      kv('ساعات المحامين المتطوعين', r.volunteer.hours);
      kv('القيمة التقديرية للعمل التطوعي (ج.م)', r.volunteer.notional_value);
      if (r.response.first_response_avg_minutes !== null) kv('متوسط زمن أول رد (دقيقة)', r.response.first_response_avg_minutes);
      if (r.response.answer_avg_days !== null) kv('متوسط زمن الوصول لإجابة قانونية (يوم)', r.response.answer_avg_days);
      if (r.satisfaction?.average) kv(`متوسط رضا المستفيدين (من ${r.satisfaction.scale})`, r.satisfaction.average);
      rows.push({});
      sec('الملفات المغلقة حسب النتيجة');
      for (const o of r.outcomes) kv(o.label, o.count);
      rows.push({});
      sec('الأثر المتحقق حسب النوع');
      rows.push({ a: 'النوع', b: 'عدد الملفات', c: 'دفعة واحدة (ج.م)', d: 'شهريًا (ج.م)', e: 'سنويًا (ج.م)' });
      for (const k of r.value.by_kind) rows.push({ a: k.label, b: k.count, c: k.one_time, d: k.monthly, e: k.annualized });
      for (const [title, list] of [['حسب المجال القانوني', r.by_area], ['حسب المحافظة', r.by_governorate], ['حسب الشهر', r.by_month]]) {
        rows.push({});
        sec(title);
        rows.push({ a: 'البند', b: 'الأسر', c: 'الطلبات', d: 'ملفات أُغلقت', e: 'القيمة السنوية (ج.م)' });
        for (const x of list) rows.push({ a: x.label, b: x.families, c: x.intakes, d: x.closed, e: x.annualized });
      }
      const cols = ['a', 'b', 'c', 'd', 'e'].map((k, i) => ({ key: k, label: i === 0 ? 'البيان' : i === 1 ? 'القيمة' : '' }));
      return { filename: `impact-${cairoDate(r.from)}_${cairoDate(r.to)}.csv`, csv: toCsv(rows, cols), report: r };
    },
  };

  // ═══════════════════════ 8) التصدير والاستيراد (CSV) ═══════════════════════

  const childrenText = (kids) => (kids || []).map((k) => `${k.birth_year}${k.gender ? ` ${k.gender === 'm' ? 'ذكر' : 'أنثى'}` : ''}`).join('؛ ');

  const EXPORTS = {
    clients() {
      const rows = db.all(
        `SELECT c.*, (SELECT GROUP_CONCAT(value, ' / ') FROM client_identities x WHERE x.client_id = c.id AND x.kind = 'phone') AS phones,
           (SELECT COUNT(*) FROM intakes WHERE client_id = c.id) AS n_intakes, (SELECT COUNT(*) FROM cases WHERE client_id = c.id) AS n_cases,
           p.relation, p.children_count, p.children, p.monthly_income_band, p.housing, p.employment, p.has_disability,
           p.foundation_file_number, p.is_foundation_beneficiary, p.data_source, p.verified_at, p.notes AS p_notes, p.client_id AS has_profile
         FROM clients c LEFT JOIN beneficiary_profiles p ON p.client_id = c.id WHERE c.merged_into IS NULL ORDER BY c.id`,
      );
      const year = cairoYearNow();
      return {
        rows: rows.map((r) => {
          const prof = r.has_profile ? mapProfile({ ...r, client_id: r.id, notes: r.p_notes }) : null;
          return { ...r, prof, score: prof ? vulnerabilityScore(prof, { year }) : null };
        }),
        columns: [
          { label: 'كود العميل', key: 'code' },
          { label: 'الاسم', key: 'name' },
          { label: 'الهاتف', key: 'phones' },
          { label: 'الرقم القومي', key: 'national_id' },
          { label: 'المحافظة', key: 'governorate' },
          { label: 'البريد الإلكتروني', key: 'email' },
          { label: 'تاريخ التسجيل', value: (r) => cairoDate(r.created_at) },
          { label: 'عدد الطلبات', key: 'n_intakes' },
          { label: 'عدد ملفات الاستشارة', key: 'n_cases' },
          { label: 'صفة المستفيد', value: (r) => (r.relation ? LABELS.beneficiary_relation[r.relation] : '') },
          { label: 'عدد الأبناء', key: 'children_count' },
          { label: 'الأبناء دون 18 سنة', value: (r) => (r.score ? r.score.minors : '') },
          { label: 'سنوات ميلاد الأبناء', value: (r) => (r.prof ? childrenText(r.prof.children) : '') },
          { label: 'الدخل الشهري', value: (r) => (r.monthly_income_band ? LABELS.income_band[r.monthly_income_band] : '') },
          { label: 'السكن', value: (r) => (r.housing ? LABELS.housing[r.housing] : '') },
          { label: 'العمل', value: (r) => (r.employment ? LABELS.employment[r.employment] : '') },
          { label: 'إعاقة أو مرض مزمن', value: (r) => (r.has_profile ? yesNo(r.has_disability) : '') },
          { label: 'رقم الملف لدى المؤسسة', key: 'foundation_file_number' },
          { label: 'مستفيد من برامج المؤسسة', value: (r) => (r.has_profile ? yesNo(r.is_foundation_beneficiary) : '') },
          { label: 'مصدر بيانات البطاقة', value: (r) => (r.data_source ? LABELS.beneficiary_source[r.data_source] : '') },
          { label: 'تاريخ التحقق', value: (r) => cairoDate(r.verified_at) },
          { label: 'درجة الاحتياج', value: (r) => (r.score ? r.score.score : '') },
          { label: 'مستوى الاحتياج', value: (r) => (r.score ? LABELS.vulnerability_level[r.score.level] : '') },
        ],
      };
    },
    intakes() {
      const rows = db.all(
        `SELECT i.*, cl.code AS client_code, c.code AS case_code, ${FIRST_RESPONSE_SQL} AS fr FROM intakes i
         LEFT JOIN clients cl ON cl.id = i.client_id LEFT JOIN cases c ON c.id = i.case_id ORDER BY i.id`,
      );
      const hours = sla.hours();
      return {
        rows,
        columns: [
          { label: 'رقم الطلب', key: 'code' },
          { label: 'تاريخ الورود', value: (r) => cairoStamp(r.created_at) },
          { label: 'الحالة', value: (r) => LABELS.intake_status[r.status] || r.status },
          { label: 'القناة', value: (r) => LABELS.channel[r.first_channel] || r.first_channel },
          { label: 'مصدر العميل', value: (r) => LABELS.source[r.source] || r.source },
          { label: 'الحملة', key: 'campaign' },
          { label: 'المجال القانوني', value: (r) => (r.legal_area ? AREA[r.legal_area] : '') },
          { label: 'الأولوية', value: (r) => LABELS.priority[r.priority] || r.priority },
          { label: 'الموضوع', key: 'title' },
          { label: 'كود العميل', key: 'client_code' },
          { label: 'المحافظة', key: 'governorate' },
          { label: 'أول رد من الإدارة', value: (r) => cairoStamp(r.fr) },
          { label: 'زمن أول رد (دقيقة)', value: (r) => (r.fr ? Math.round((Date.parse(r.fr) - Date.parse(r.created_at)) / 60000) : '') },
          { label: 'ضمن مهلة الخدمة', value: (r) => (!SLA_CHANNELS.includes(r.first_channel) ? '' : r.fr ? yesNo((Date.parse(r.fr) - Date.parse(r.created_at)) / 3600000 <= hours) : '') },
          { label: 'كود الملف', key: 'case_code' },
        ],
      };
    },
    cases() {
      const rows = db.all(
        `SELECT c.*, cl.code AS client_code, cl.name AS client_name, mg.name AS manager_name, m.code AS matter_code,
           (SELECT u.name FROM assignments a JOIN users u ON u.id = a.lawyer_id WHERE a.case_id = c.id AND a.role = 'lead' AND a.status != 'withdrawn' ORDER BY a.id DESC LIMIT 1) AS lead_name,
           (SELECT COUNT(*) FROM assignments a WHERE a.case_id = c.id AND a.status != 'withdrawn') AS team
         FROM cases c JOIN clients cl ON cl.id = c.client_id LEFT JOIN users mg ON mg.id = c.case_manager_id LEFT JOIN matters m ON m.id = c.matter_id ORDER BY c.id`,
      );
      return {
        rows,
        columns: [
          { label: 'كود الملف', key: 'code' },
          { label: 'العنوان', key: 'title' },
          { label: 'المجال القانوني', value: (r) => AREA[r.legal_area] || r.legal_area },
          { label: 'الحالة', value: (r) => LABELS.case_status[r.status] || r.status },
          { label: 'الأولوية', value: (r) => LABELS.priority[r.priority] || r.priority },
          { label: 'كود العميل', key: 'client_code' },
          { label: 'اسم العميل', key: 'client_name' },
          { label: 'مدير الحالة', key: 'manager_name' },
          { label: 'المحامي الأساسي', key: 'lead_name' },
          { label: 'عدد أعضاء الفريق', key: 'team' },
          { label: 'تاريخ الفتح', value: (r) => cairoDate(r.created_at) },
          { label: 'تاريخ الإغلاق', value: (r) => cairoDate(r.closed_at) },
          { label: 'نتيجة الملف', value: (r) => (r.outcome ? LABELS.case_outcome[r.outcome] : '') },
          { label: 'نوع الأثر المتحقق', value: (r) => (r.outcome_kind ? LABELS.outcome_kind[r.outcome_kind] : '') },
          { label: 'المسترد دفعة واحدة (ج.م)', value: (r) => egp(r.recovered_one_time_minor) },
          { label: 'المسترد شهريًا (ج.م)', value: (r) => egp(r.recovered_monthly_minor) },
          { label: 'مصدر العميل', value: (r) => (r.source ? LABELS.source[r.source] || r.source : '') },
          { label: 'الملف المستمر', key: 'matter_code' },
        ],
      };
    },
    matters() {
      const rows = db.all(
        `SELECT m.*, cl.code AS client_code, c.code AS case_code, u.name AS lawyer_name,
           (SELECT COALESCE(SUM(amount_minor), 0) FROM invoices i WHERE i.matter_id = m.id AND i.status != 'cancelled') AS invoiced,
           (SELECT COALESCE(SUM(p.amount_minor), 0) FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.matter_id = m.id) AS paid
         FROM matters m JOIN clients cl ON cl.id = m.client_id JOIN cases c ON c.id = m.case_id LEFT JOIN users u ON u.id = m.responsible_lawyer_id ORDER BY m.id`,
      );
      return {
        rows,
        columns: [
          { label: 'كود الملف المستمر', key: 'code' },
          { label: 'العنوان', key: 'title' },
          { label: 'النوع', value: (r) => LABELS.matter_kind[r.kind] || r.kind },
          { label: 'الحالة', value: (r) => LABELS.matter_status[r.status] || r.status },
          { label: 'كود العميل', key: 'client_code' },
          { label: 'ملف الاستشارة', key: 'case_code' },
          { label: 'المحكمة', key: 'court' },
          { label: 'الدائرة', key: 'circuit' },
          { label: 'رقم الدعوى', key: 'lawsuit_number' },
          { label: 'سنة الدعوى', key: 'lawsuit_year' },
          { label: 'الخصم', key: 'opponent' },
          { label: 'المحامي المسؤول', key: 'lawyer_name' },
          { label: 'تاريخ الفتح', value: (r) => cairoDate(r.opened_at) },
          { label: 'تاريخ الإغلاق', value: (r) => cairoDate(r.closed_at) },
          { label: 'الأتعاب المتفق عليها (ج.م)', value: (r) => egp(r.agreed_fee_minor) },
          { label: 'إجمالي الفواتير (ج.م)', value: (r) => fromMinor(Number(r.invoiced)) },
          { label: 'المحصّل (ج.م)', value: (r) => fromMinor(Number(r.paid)) },
          { label: 'نوع الأثر المتحقق', value: (r) => (r.outcome_kind ? LABELS.outcome_kind[r.outcome_kind] : '') },
          { label: 'المسترد دفعة واحدة (ج.م)', value: (r) => egp(r.recovered_one_time_minor) },
          { label: 'المسترد شهريًا (ج.م)', value: (r) => egp(r.recovered_monthly_minor) },
        ],
      };
    },
    lawyers() {
      const rows = db.all(
        `SELECT u.*, l.title, l.specialties, l.agreement, l.capacity, l.firm, l.bar_number, l.bar_level,
           (SELECT COUNT(*) FROM assignments a WHERE a.lawyer_id = u.id AND a.status IN ('assigned','in_progress','submitted','returned')) AS open_n,
           (SELECT COUNT(*) FROM assignments a WHERE a.lawyer_id = u.id AND a.status = 'approved') AS done_n
         FROM users u JOIN lawyers l ON l.user_id = u.id WHERE u.role = 'lawyer' ORDER BY u.id`,
      );
      return {
        rows,
        columns: [
          { label: 'اسم المستخدم', key: 'username' },
          { label: 'الاسم', key: 'name' },
          { label: 'اللقب', key: 'title' },
          { label: 'الهاتف', key: 'phone' },
          { label: 'البريد الإلكتروني', key: 'email' },
          { label: 'التخصصات', value: (r) => parseJson(r.specialties, []).map((s) => AREA[s] || s).join('؛ ') },
          { label: 'نوع الاتفاق', value: (r) => LABELS.agreement_type[parseJson(r.agreement, {}).type] || '' },
          { label: 'تفاصيل الاتفاق', value: (r) => describeAgreement(parseJson(r.agreement, {})) },
          { label: 'الطاقة الاستيعابية', key: 'capacity' },
          { label: 'مكتب المحاماة', key: 'firm' },
          { label: 'رقم القيد', key: 'bar_number' },
          { label: 'درجة القيد', key: 'bar_level' },
          { label: 'الحساب', value: (r) => (r.active ? 'نشط' : 'موقوف') },
          { label: 'إسنادات مفتوحة', key: 'open_n' },
          { label: 'إسنادات معتمدة', key: 'done_n' },
        ],
      };
    },
    ledger() {
      const rows = db.all(
        `SELECT e.*, u.name AS lawyer_name, c.code AS case_code, m.code AS matter_code FROM ledger_entries e
         JOIN users u ON u.id = e.lawyer_id LEFT JOIN cases c ON c.id = e.case_id LEFT JOIN matters m ON m.id = e.matter_id ORDER BY e.id`,
      );
      return {
        rows,
        columns: [
          { label: 'رقم القيد', key: 'id' },
          { label: 'التاريخ', value: (r) => cairoDate(r.created_at) },
          { label: 'الفترة', key: 'period' },
          { label: 'المحامي', key: 'lawyer_name' },
          { label: 'النوع', value: (r) => LABELS.ledger_kind[r.kind] || r.kind },
          { label: 'المبلغ (ج.م)', value: (r) => fromMinor(r.amount_minor) },
          { label: 'الحالة', value: (r) => LABELS.ledger_status[r.status] || r.status },
          { label: 'ملف الاستشارة', key: 'case_code' },
          { label: 'الملف المستمر', key: 'matter_code' },
          { label: 'البيان', key: 'description' },
        ],
      };
    },
  };

  // ── الاستيراد ──
  const truthy = (s) => /^(1|نعم|اه|أيوه|ايوه|yes|y|true|صح|✓)$/i.test(String(s || '').trim());
  const falsy = (s) => /^(0|لا|no|n|false)$/i.test(String(s || '').trim());

  /** قيمة من مجموعة مسميات: بالمفتاح أو بالمسمى العربي (مع توحيد الحروف) أو بمرادفات */
  function fromLabel(group, raw, synonyms = {}) {
    const s = String(raw || '').trim();
    if (!s) return null;
    if (LABELS[group] && Object.prototype.hasOwnProperty.call(LABELS[group], s)) return s;
    const n = normalizeArabic(s).replace(/\s+/g, ' ');
    for (const [k, lbl] of Object.entries(LABELS[group] || {})) if (normalizeArabic(lbl).replace(/\s+/g, ' ') === n) return k;
    for (const [k, words] of Object.entries(synonyms)) if (words.some((w) => normalizeArabic(w) === n)) return k;
    return undefined;
  }

  function incomeFrom(raw) {
    const k = fromLabel('income_band', raw, { none: ['لا يوجد', 'بدون دخل', 'لا دخل', 'صفر'] });
    if (k !== undefined) return k;
    // رقم بالجنيه أو نص مثل «أقل من 2000» أو «من 2000 إلى 4000» أو «أكثر من 7000»
    const s = normalizeArabic(String(raw)).replace(/[,٬]/g, '');
    const nums = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (!nums.length) return undefined;
    let n = nums.length >= 2 ? (nums[0] + nums[1]) / 2 : nums[0];
    if (nums.length === 1 && /(اقل|تحت|حتي)/.test(s)) n -= 1;
    if (nums.length === 1 && /(اكثر|فوق)/.test(s)) n += 1;
    if (!Number.isFinite(n) || n < 0) return undefined;
    return n === 0 ? 'none' : n < 2000 ? 'lt_2000' : n <= 4000 ? '2000_4000' : n <= 7000 ? '4000_7000' : 'gt_7000';
  }

  function childrenFrom(raw) {
    const s = latinDigits(String(raw || '')).trim();
    if (!s) return [];
    return s.split(/[،,؛;|/]+/).map((part) => {
      const p = part.trim();
      const y = p.match(/(19|20)\d{2}/);
      if (!y) throw new Error(`سنة ميلاد غير صالحة: «${p}»`);
      const g = /(^|\s)(ذ|ذكر|ولد|ابن|m|male)(\s|$)/i.test(p) ? 'm' : /(^|\s)(أ|ا|انثى|أنثى|بنت|ابنة|f|female)(\s|$)/i.test(p) ? 'f' : null;
      return { birth_year: Number(y[0]), gender: g };
    });
  }

  function specialtiesFrom(raw) {
    const parts = String(raw || '').split(/[،,؛;|/]+/).map((x) => x.trim()).filter(Boolean);
    const out = [];
    for (const p of parts) {
      const up = p.toUpperCase();
      if (AREA_CODES.includes(up)) out.push(up);
      else {
        const n = normalizeArabic(p);
        const hit = LEGAL_AREAS.find((a) => normalizeArabic(a.label) === n || normalizeArabic(a.label).startsWith(n) || normalizeArabic(a.label).includes(n));
        if (!hit) throw new Error(`تخصص غير معروف: «${p}»`);
        out.push(hit.code);
      }
    }
    return [...new Set(out)];
  }

  const AGREEMENT_SYNONYMS = {
    per_case: ['بالقطعه', 'بالقطعة', 'بالاستشاره', 'لكل استشاره'],
    monthly: ['شهري', 'مبلغ شهري', 'شهري ثابت'],
    monthly_quota: ['شهري بحصه', 'شهري بحصة', 'حصه شهريه'],
    package: ['باقه', 'باقة', 'باقه استشارات'],
    pro_bono: ['تطوعي', 'تطوع', 'مجاني'],
    csr: ['مسؤوليه مجتمعيه', 'مسؤولية مجتمعية', 'csr'],
  };

  const IMPORTS = {
    lawyers: {
      fields: [
        { key: 'name', label: 'الاسم', required: true, aliases: ['اسم المحامي', 'name'] },
        { key: 'username', label: 'اسم المستخدم', required: true, aliases: ['username', 'المستخدم'] },
        { key: 'phone', label: 'الهاتف', aliases: ['رقم الهاتف', 'الموبايل', 'phone'] },
        { key: 'email', label: 'البريد الإلكتروني', aliases: ['البريد', 'email'] },
        { key: 'title', label: 'اللقب', aliases: ['title'] },
        { key: 'specialties', label: 'التخصصات', required: true, aliases: ['التخصص', 'specialties'] },
        { key: 'agreement_type', label: 'نوع الاتفاق', required: true, aliases: ['الاتفاق', 'agreement', 'agreement_type'] },
        { key: 'rate', label: 'المبلغ', aliases: ['الأجر', 'السعر', 'rate', 'amount'] },
        { key: 'quota', label: 'عدد الاستشارات', aliases: ['الحصة', 'quota'] },
        { key: 'overage_rate', label: 'سعر الزيادة', aliases: ['overage_rate'] },
        { key: 'capacity', label: 'الطاقة الاستيعابية', aliases: ['capacity'] },
        { key: 'firm', label: 'مكتب المحاماة', aliases: ['المكتب', 'firm'] },
        { key: 'bar_number', label: 'رقم القيد', aliases: ['bar_number'] },
        { key: 'notes', label: 'ملاحظات', aliases: ['notes'] },
      ],
      example: [
        ['أحمد سمير', 'ahmed.samir', '01012345678', 'ahmed@example.org', 'أ.', 'INH؛ FAM', 'بالقطعة', '400', '', '', '10', '', '51234', 'متطوع سابق في برامج المؤسسة'],
        ['منى الشاذلي', 'mona.shazly', '01198765432', '', 'أ.', 'أحوال شخصية وأسرة', 'تطوعي', '500', '', '', '6', '', '', 'القيمة التقديرية للاستشارة 500 ج.م'],
      ],
      build(rec, ctx) {
        const errors = [];
        const warnings = [];
        const body = {};
        const tryv = (fn) => {
          try {
            return fn();
          } catch (e) {
            errors.push(e.message);
            return null;
          }
        };
        body.name = tryv(() => v.str(rec.name, 'الاسم', { required: true, max: 120 }));
        body.username = tryv(() => {
          const u = v.str(rec.username, 'اسم المستخدم', { required: true, min: 3, max: 40 });
          if (!/^[a-zA-Z0-9._-]+$/.test(u)) throw badRequest('اسم المستخدم يقبل الحروف اللاتينية والأرقام والنقطة والشرطة فقط');
          if (db.get('SELECT 1 FROM users WHERE username = ?', u)) throw badRequest(`اسم المستخدم «${u}» مستخدم بالفعل`);
          if (ctx.usernames.has(u.toLowerCase())) throw badRequest(`اسم المستخدم «${u}» مكرر في الملف`);
          ctx.usernames.add(u.toLowerCase());
          return u;
        });
        body.phone = tryv(() => v.phone(rec.phone, 'الهاتف'));
        body.email = tryv(() => v.email(rec.email, 'البريد الإلكتروني'));
        body.title = tryv(() => v.str(rec.title, 'اللقب', { max: 20 })) || 'أ.';
        body.specialties = tryv(() => {
          const s = specialtiesFrom(rec.specialties);
          if (!s.length) throw badRequest('حدد تخصصًا واحدًا على الأقل');
          return s;
        });
        body.capacity = tryv(() => v.int(rec.capacity, 'الطاقة الاستيعابية', { min: 1, max: 1000 })) ?? 10;
        body.firm = tryv(() => v.str(rec.firm, 'مكتب المحاماة', { max: 150 }));
        body.bar_number = tryv(() => v.str(rec.bar_number, 'رقم القيد', { max: 40 }));
        body.notes = tryv(() => v.str(rec.notes, 'ملاحظات', { max: 3000 }));
        const type = fromLabel('agreement_type', rec.agreement_type, AGREEMENT_SYNONYMS);
        if (!type) errors.push(type === undefined ? `نوع الاتفاق «${rec.agreement_type}» غير معروف` : 'الحقل «نوع الاتفاق» مطلوب');
        else {
          const amount = rec.rate;
          const ag = { type, billable_event: 'on_approval' };
          if (type === 'per_case') ag.rate = amount;
          if (type === 'monthly') ag.monthly_fee = amount;
          if (type === 'monthly_quota') Object.assign(ag, { monthly_fee: amount, quota: rec.quota, overage_rate: rec.overage_rate });
          if (type === 'package') Object.assign(ag, { package_price: amount, package_size: rec.quota, overage_rate: rec.overage_rate || 0 });
          if (type === 'pro_bono') ag.notional_value = amount || 0;
          if (type === 'csr') Object.assign(ag, { csr_firm: rec.firm, csr_cases_commitment: rec.quota, notional_value: amount || 0, csr_period: 'year' });
          body.agreement = tryv(() => validateAgreement(ag));
        }
        if (!body.phone && !body.email) warnings.push('لا يوجد هاتف أو بريد للتواصل مع المحامي');
        return { body, errors, warnings, preview: { name: body.name, username: body.username, specialties: (body.specialties || []).map((s) => AREA[s]).join('، '), agreement: body.agreement ? describeAgreement(body.agreement) : null } };
      },
      commit(body, actor) {
        // الحساب يُنشأ «بانتظار الدعوة» كما في وحدة الحسابات: لا كلمة مرور صالحة لأحد، وتُصدر الإدارة
        // لكل محامٍ رابط دعوة من صفحته ليختار كلمة مروره بنفسه (أو تعيّن له كلمة مؤقتة)
        const lawyer = app.lawyers.create({ ...body, password: `${randomToken(18)}Aa1!` }, actor);
        db.update('users', lawyer.id, { password_hash: UNUSABLE_PASSWORD, invite_pending: 1, must_change_password: 0 });
        return { id: lawyer.id, label: lawyer.name || body.name };
      },
    },
    clients: {
      fields: [
        { key: 'name', label: 'الاسم', required: true, aliases: ['اسم المستفيد', 'اسم العميل', 'name'] },
        { key: 'phone', label: 'الهاتف', aliases: ['رقم الهاتف', 'الموبايل', 'phone'] },
        { key: 'national_id', label: 'الرقم القومي', aliases: ['national_id'] },
        { key: 'governorate', label: 'المحافظة', aliases: ['governorate'] },
        { key: 'email', label: 'البريد الإلكتروني', aliases: ['البريد', 'email'] },
        { key: 'relation', label: 'صفة المستفيد', aliases: ['الصفة', 'relation'] },
        { key: 'children_count', label: 'عدد الأبناء', aliases: ['children_count'] },
        { key: 'children', label: 'سنوات ميلاد الأبناء', aliases: ['الأبناء', 'children'] },
        { key: 'monthly_income_band', label: 'الدخل الشهري', aliases: ['الدخل', 'income'] },
        { key: 'housing', label: 'السكن', aliases: ['housing'] },
        { key: 'employment', label: 'العمل', aliases: ['employment'] },
        { key: 'has_disability', label: 'إعاقة أو مرض مزمن', aliases: ['إعاقة', 'disability'] },
        { key: 'foundation_file_number', label: 'رقم الملف لدى المؤسسة', aliases: ['رقم الملف', 'file_number'] },
        { key: 'is_foundation_beneficiary', label: 'مستفيد من برامج المؤسسة', aliases: ['مستفيد', 'beneficiary'] },
        { key: 'verified', label: 'تم التحقق', aliases: ['محقق', 'verified'] },
        { key: 'notes', label: 'ملاحظات', aliases: ['notes'] },
      ],
      example: [
        ['نجلاء عبد الرحمن', '01011223344', '', 'القاهرة', '', 'أرملة', '3', '2012 ذكر، 2015 أنثى، 2019 أنثى', '1800', 'إيجار جديد', 'عمل غير منتظم أو باليومية', 'لا', 'BM-2024-0153', 'نعم', 'نعم', 'محالة من برنامج «نجاح»'],
        ['صفاء محمود', '01155443322', '', 'الجيزة', '', 'وصي أو كافل أيتام', '2', '2016، 2018', 'أقل من 2,000 ج.م شهريًا', 'إقامة لدى الأسرة', 'بلا عمل', 'نعم', '', 'لا', 'لا', ''],
      ],
      build(rec, ctx) {
        const errors = [];
        const warnings = [];
        const tryv = (fn) => {
          try {
            return fn();
          } catch (e) {
            errors.push(e.message);
            return null;
          }
        };
        const client = {};
        client.name = tryv(() => v.str(rec.name, 'الاسم', { required: true, min: 2, max: 150 }));
        client.phone = tryv(() => {
          const p = v.phone(rec.phone, 'الهاتف');
          if (!p) return null;
          const owner = db.get("SELECT c.code FROM client_identities x JOIN clients c ON c.id = x.client_id WHERE x.kind = 'phone' AND x.value = ?", p);
          if (owner) throw badRequest(`رقم الهاتف مسجل بالفعل للعميل ${owner.code}`);
          if (ctx.phones.has(p)) throw badRequest('رقم الهاتف مكرر في الملف');
          ctx.phones.add(p);
          return p;
        });
        client.national_id = tryv(() => {
          const n = validateNationalId(rec.national_id);
          if (!n) return null;
          const owner = db.get('SELECT code FROM clients WHERE national_id = ? AND merged_into IS NULL', n);
          if (owner) throw badRequest(`الرقم القومي مسجل بالفعل للعميل ${owner.code}`);
          if (ctx.nids.has(n)) throw badRequest('الرقم القومي مكرر في الملف');
          ctx.nids.add(n);
          return n;
        });
        client.governorate = tryv(() => {
          const g = String(rec.governorate || '').trim().replace(/^محافظة\s+/, '');
          if (!g) return null;
          const n = normalizeArabic(g);
          const hit = GOVERNORATES.find((x) => normalizeArabic(x) === n);
          if (!hit) throw badRequest(`المحافظة «${g}» غير معروفة`);
          return hit;
        });
        client.email = tryv(() => v.email(rec.email, 'البريد الإلكتروني'));
        client.notes = tryv(() => v.str(rec.notes, 'ملاحظات', { max: 5000 }));
        if (!client.phone) warnings.push('بدون رقم هاتف: لن تُربط رسائل واتساب بهذا العميل تلقائيًا');

        const ben = {};
        const set = (k, fn) => {
          const val = tryv(fn);
          if (val !== null && val !== undefined) ben[k] = val;
        };
        set('relation', () => {
          const r = fromLabel('beneficiary_relation', rec.relation, { widow: ['ارمله', 'أرملة'], orphan_guardian: ['وصي', 'كافل', 'كافله', 'وصيه'], divorced: ['مطلقه', 'مطلقة'] });
          if (r === undefined) throw badRequest(`صفة المستفيد «${rec.relation}» غير معروفة`);
          return r;
        });
        set('children', () => {
          try {
            const kids = childrenFrom(rec.children);
            return kids.length ? kids : null;
          } catch (e) {
            throw badRequest(e.message);
          }
        });
        set('children_count', () => v.int(rec.children_count, 'عدد الأبناء', { min: 0, max: 30 }));
        set('monthly_income_band', () => {
          const k = incomeFrom(rec.monthly_income_band);
          if (k === undefined) throw badRequest(`الدخل الشهري «${rec.monthly_income_band}» غير مفهوم`);
          return k;
        });
        set('housing', () => {
          const k = fromLabel('housing', rec.housing, { owned: ['ملك', 'تمليك'], rented_old: ['قديم'], rented_new: ['جديد', 'ايجار'], family: ['مع الاسره', 'مع الأهل', 'لدى الاسره'] });
          if (k === undefined) throw badRequest(`السكن «${rec.housing}» غير مفهوم`);
          return k;
        });
        set('employment', () => {
          const k = fromLabel('employment', rec.employment, { none: ['لا تعمل', 'لا يعمل', 'ربة منزل', 'بدون عمل'], irregular: ['يوميه', 'غير منتظم'], employed: ['موظفه', 'موظف', 'تعمل'], pension: ['معاش'] });
          if (k === undefined) throw badRequest(`العمل «${rec.employment}» غير مفهوم`);
          return k;
        });
        if (String(rec.has_disability || '').trim()) {
          if (truthy(rec.has_disability)) ben.has_disability = true;
          else if (!falsy(rec.has_disability)) errors.push('قيمة «إعاقة أو مرض مزمن» يجب أن تكون نعم أو لا');
        }
        set('foundation_file_number', () => v.str(rec.foundation_file_number, 'رقم الملف لدى المؤسسة', { max: 40 }));
        if (String(rec.is_foundation_beneficiary || '').trim()) ben.is_foundation_beneficiary = truthy(rec.is_foundation_beneficiary);
        let benData = null;
        if (Object.keys(ben).length) {
          benData = tryv(() => validateBeneficiary(ben));
        }
        const verified = truthy(rec.verified);
        return {
          body: { client, ben: benData, verified },
          errors,
          warnings,
          preview: { name: client.name, phone: client.phone ? isoLtr(maskPhone(client.phone)) : null, governorate: client.governorate, relation: ben.relation ? LABELS.beneficiary_relation[ben.relation] : null, children: ben.children_count ?? (ben.children ? ben.children.length : null) },
        };
      },
      commit(body, actor) {
        const t = nowIso();
        const c = app.clients.create({ name: body.client.name, governorate: body.client.governorate, email: body.client.email, national_id: body.client.national_id, notes: body.client.notes });
        if (body.client.phone) app.clients.addIdentity(c.id, 'phone', body.client.phone);
        if (body.client.email) {
          try {
            app.clients.addIdentity(c.id, 'email', body.client.email);
          } catch {
            /* البريد مرتبط بعميل آخر: يبقى في بيانات العميل فقط */
          }
        }
        if (body.ben) {
          db.insert('beneficiary_profiles', {
            client_id: c.id,
            ...body.ben,
            data_source: 'import',
            verified_by: body.verified ? actor.id : null,
            verified_at: body.verified ? t : null,
            updated_by: actor.id,
            created_at: t,
            updated_at: t,
          });
        }
        app.activity.log({ client_id: c.id, actor, type: 'client.imported', summary: `أُضيف العميل ${c.code} من ملف استيراد${body.ben ? ' مع بطاقة المستفيد' : ''}` });
        return { id: c.id, label: `${c.code} — ${body.client.name}` };
      },
    },
  };

  function mapHeader(entity, header) {
    const spec = IMPORTS[entity];
    const norm = (s) => normalizeArabic(String(s || '')).replace(/[\s_*]+/g, ' ').trim().toLowerCase();
    const index = {};
    const unknown = [];
    header.forEach((h, i) => {
      const n = norm(h);
      if (!n) return;
      const f = spec.fields.find((x) => norm(x.key) === n || norm(x.label) === n || (x.aliases || []).some((a) => norm(a) === n));
      if (f && index[f.key] === undefined) index[f.key] = i;
      else if (!f) unknown.push(h);
    });
    const missing = spec.fields.filter((f) => f.required && index[f.key] === undefined).map((f) => f.label);
    return { index, unknown, missing };
  }

  function analyzeImport(entity, csvText) {
    const spec = IMPORTS[entity];
    if (!spec) throw notFound('نوع الاستيراد غير مدعوم');
    const text = v.str(csvText, 'محتوى الملف', { required: true, max: 3 * 1024 * 1024, trim: false });
    let parsed;
    try {
      parsed = parseCsv(text, { maxRows: 2000 });
    } catch (e) {
      throw badRequest(e.message);
    }
    if (!parsed.header.length) throw badRequest('الملف فارغ');
    const { index, unknown, missing } = mapHeader(entity, parsed.header);
    if (missing.length) throw badRequest(`أعمدة مطلوبة غير موجودة في الملف: ${missing.join('، ')}. نزّل القالب واستخدم نفس العناوين.`, { missing });
    if (!parsed.rows.length) throw badRequest('لا توجد صفوف بيانات بعد سطر العناوين');
    const ctx = { usernames: new Set(), phones: new Set(), nids: new Set() };
    const rows = parsed.rows.map((r) => {
      const rec = {};
      for (const [k, i] of Object.entries(index)) rec[k] = r.cells[i] ?? '';
      const built = spec.build(rec, ctx);
      return { line: r.line, ok: !built.errors.length, errors: built.errors, warnings: built.warnings, preview: built.preview, body: built.body };
    });
    return {
      entity,
      columns: spec.fields.map((f) => ({ key: f.key, label: f.label, required: !!f.required, found: index[f.key] !== undefined })),
      unknown_headers: unknown,
      total: rows.length,
      valid: rows.filter((r) => r.ok).length,
      invalid: rows.filter((r) => !r.ok).length,
      rows,
    };
  }

  const data = {
    entities: Object.keys(EXPORTS),
    importable: Object.keys(IMPORTS),
    export(entity, actor, ctx) {
      const fn = EXPORTS[entity];
      if (!fn) throw notFound('نوع التصدير غير مدعوم');
      const { rows, columns } = fn();
      const stamp = cairoDate(nowIso());
      app.audit.log({
        actor,
        ctx,
        type: 'data.exported',
        severity: 'warning',
        summary: `تصدير «${LABELS.data_entity[entity]}» بصيغة CSV (عدد الصفوف: ${rows.length})`,
        data: { entity, rows: rows.length },
      });
      return { filename: `beyoot-${entity}-${stamp}.csv`, csv: toCsv(rows, columns), count: rows.length };
    },
    template(entity) {
      const spec = IMPORTS[entity];
      if (!spec) throw notFound('لا يوجد قالب لهذا النوع');
      const cols = spec.fields.map((f, i) => ({ label: f.label, value: (r) => r[i] }));
      return { filename: `template-${entity}.csv`, csv: toCsv(spec.example, cols) };
    },
    preview(entity, body) {
      const r = analyzeImport(entity, body.csv);
      return { ...r, rows: r.rows.slice(0, 1000).map(({ body: _b, ...x }) => x) };
    },
    /** إضافة الصفوف السليمة فقط في معاملة واحدة (إما تُضاف كلها أو لا يُضاف شيء) */
    commit(entity, body, actor, ctx) {
      const r = analyzeImport(entity, body.csv);
      const good = r.rows.filter((x) => x.ok);
      if (!good.length) throw badRequest('لا توجد صفوف سليمة للاستيراد. صحح الأخطاء ثم أعد المعاينة.');
      if (body.expected_valid !== undefined && Number(body.expected_valid) !== good.length) {
        throw conflict('تغيرت نتيجة المعاينة منذ عرضها (ربما أُضيفت بيانات مطابقة). أعد المعاينة قبل الاستيراد.');
      }
      const created = db.tx(() => good.map((x) => ({ line: x.line, ...IMPORTS[entity].commit(x.body, actor) })));
      app.audit.log({
        actor,
        ctx,
        type: 'data.imported',
        severity: 'warning',
        summary: `استيراد «${LABELS.data_entity[entity]}» من CSV: أُضيف ${arabicCount(created.length, ROW_FORMS)}${r.invalid ? `، وتُركت الصفوف التي بها أخطاء (${r.invalid})` : ''}`,
        data: { entity, created: created.length, skipped: r.invalid },
      });
      return { entity, created: created.length, skipped: r.invalid, items: created.slice(0, 200), errors: r.rows.filter((x) => !x.ok).slice(0, 200).map(({ line, errors }) => ({ line, errors })) };
    },
    summary() {
      const n = (sql) => Number(db.value(sql));
      return {
        counts: {
          clients: n('SELECT COUNT(*) FROM clients WHERE merged_into IS NULL'),
          intakes: n('SELECT COUNT(*) FROM intakes'),
          cases: n('SELECT COUNT(*) FROM cases'),
          matters: n('SELECT COUNT(*) FROM matters'),
          lawyers: n("SELECT COUNT(*) FROM users WHERE role = 'lawyer'"),
          ledger: n('SELECT COUNT(*) FROM ledger_entries'),
          beneficiary_profiles: n('SELECT COUNT(*) FROM beneficiary_profiles'),
        },
        history: app.audit.list({ type: 'data', limit: 15 }).items.map((e) => ({ id: e.id, type: e.type, summary: e.summary, actor: e.user_name || e.actor_name, created_at: e.created_at })),
      };
    },
  };

  return {
    beneficiary,
    outcome,
    parties,
    conflicts,
    calendar,
    search,
    sla,
    impact,
    data,
    // اختصارات تستدعيها وحدات أخرى بتعديلات موضعية
    onCaseCreated: (c, actor) => parties.onCaseCreated(c, actor),
    syncMatterOpponent: (id, actor) => parties.syncMatterOpponent(id, actor),
    onClientsMerged: (targetId, otherId) => beneficiary.onMerged(targetId, otherId),
    slaSummary: () => sla.summary(),
  };
}
