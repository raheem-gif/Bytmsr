// v9.2 (admin-ai) — القصص الواردة: قصة واتساب أو الموقع ← ملخص الذكاء الاصطناعي والمسار المقترح ← طلب بنقرة واحدة.
//
// • القصة «تُكتب» (collecting) حتى تكتمل: 10 دقائق بلا رسائل منها، أو «خلاص»، أو «لخّصها الآن» من الإدارة.
// • عندها تُلخَّص مرة واحدة (Claude أو المحلل المحلي) ويُقترح مسار: استشارة / قضية / ترد الإدارة / توجيه / نسألها الأول.
// • الإدارة تعتمد المسار بنقرة في نموذج معبأ (accept). لا يصل نص كتبه الذكاء الاصطناعي لها أو لمحامٍ إلا بعد هذه النقرة.
// • الرسائل الآلية للقصة (الترحيب، طلب الحكاية، «وصلتنا حكايتك») نصوص ثابتة، متوقفة افتراضيًا، لا تصل إلا لقصص
//   بدأت من واتساب، داخل نافذة الـ 24 ساعة فقط، ولا تجعل رسائلها «مقروءة».
// • طلبات «إحنا نكلمك» بلا حكاية تظهر أولًا؛ المكالمة تُسجَّل (call-note) فتصير قصة تُلخَّص، والمحاولات الفاشلة تُسجَّل.
import {
  nowIso, parseJson, badRequest, notFound, conflict, ApiError, v, arabicCount, cairoDayKey, cairoYear, truncate, addressName, addressForm, genderize,
} from '../util.js';
import { LABELS, CLIENT_TEXTS, STORY_TRACKS, ENUMS, AREA_CODES, CODE_PREFIX } from '../constants.js';
import {
  factsText, isCannedCallback, isFactual, isPortalUnverifiedIntake, portalUnverifiedSql, storyWords, PORTAL_LINK_VAR, withoutLinkLines,
} from '../channels/engine.js';
import { TOPICS, topicByKey, staffLines, STAFF_LINES_TITLE, CALLBACK_WHEN } from '../../public/assets/js/public/topics.js';
import { questionsFor } from '../ai/heuristic.js';

export { isFactual };

const OPEN = ['new', 'in_review', 'awaiting_client'];
const OPEN_SQL = "('new','in_review','awaiting_client')";
const VOICE_PLACEHOLDER = '[رسالة صوتية]';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const CALL_OUTCOMES = Object.keys(LABELS.call_outcome);
const CLIENT_REF_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

/**
 * [R2-A11] حالة القصة كما تراها الإدارة — تعريف واحد (SQL) للقائمة والعدادات والفلاتر وترتيب الفرز والمهمة الدورية.
 * i = صف intakes. أول شرط ينطبق: decided ← awaiting ← callback ← collecting ← blocked ← stale ← ready.
 */
export const STORY_VIEW_SQL = `CASE
  WHEN i.status NOT IN ('new','in_review','awaiting_client') THEN 'decided'
  WHEN i.status = 'awaiting_client' THEN 'awaiting'
  WHEN json_extract(CASE WHEN json_valid(i.form_answers) THEN i.form_answers END, '$.callback') IS NOT NULL
    AND json_extract(CASE WHEN json_valid(i.form_answers) THEN i.form_answers END, '$.story') = 'none' AND i.story_rev = 0 THEN 'callback'
  WHEN i.story_state = 'collecting' THEN 'collecting'
  WHEN (i.voice_missing > 0 OR i.media_failed = 1) AND i.story_letters < 60 THEN 'blocked'
  WHEN i.analyzed_rev < i.story_rev THEN 'stale'
  ELSE 'ready' END`;

/** [R2-B8] ترتيب الفرز: طلبات المكالمة أولًا، ثم الجاهزة ومعها المحجوبة (رسالة صوتية لم تُكتب)، ثم ما وصل بعد الملخص… */
export const STORY_TRIAGE_RANK_SQL = `CASE (${STORY_VIEW_SQL}) WHEN 'callback' THEN 0 WHEN 'ready' THEN 1 WHEN 'blocked' THEN 1 WHEN 'stale' THEN 2 WHEN 'collecting' THEN 3 WHEN 'awaiting' THEN 4 ELSE 5 END`;

const isoMinus = (iso, ms) => new Date(Date.parse(iso) - ms).toISOString();

/** حروف ذات معنى في نص (بعد حذف [ … ] والتحيات والشكر و«خلاص» والأكواد) */
function lettersOf(text, doneWords) {
  return (storyWords(String(text || '').replace(/\[[^\]]*\]/g, ' '), doneWords).match(/\p{L}/gu) || []).length;
}

/**
 * [مراجعة 9.2] مسودة رد بلا كلام: التحية والتوقيع فقط («أهلًا يا هبة،\n\n— المؤسسة»)، كما يكتبها الاقتراح حين لا يجد
 * المحلل ردًا جاهزًا. لا تُقرأ لها في المكالمة (call_script) — نفس قاعدة الواجهة isSkeletonReply.
 */
export function isSkeletonDraft(text) {
  const body = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^—/.test(l))
    .map((l) => l.replace(/^أهل(?:ًا|اً|ا)[^،,]*[،,]?/, ''));
  return body.join('').replace(/[^\p{L}]/gu, '').length < 3;
}

export function createStories(app) {
  const { db } = app;
  const quietTimers = new Map();

  const row = (id) => db.get(`SELECT i.*, (${STORY_VIEW_SQL}) AS story_view FROM intakes i WHERE i.id = ?`, id);
  const requireRow = (id) => {
    const i = row(id);
    if (!i) throw notFound('الطلب غير موجود');
    return i;
  };
  const setting = (k) => app.settings.get(k);
  const quietMinutes = () => Math.min(120, Math.max(2, Number(setting('story_quiet_minutes')) || 10));
  const claudeMode = () => {
    try {
      return app.ai.status().provider === 'anthropic';
    } catch {
      return false;
    }
  };
  const officeOpen = () => {
    try {
      return app.portal?.officeOpen ? app.portal.officeOpen(setting('office_hours_schedule')) : null;
    } catch {
      return null;
    }
  };
  const actorName = (actor) => actor?.name || 'الإدارة';

  /** فك form_answers (يكتبه نموذج الموقع) أو null */
  function formJson(i) {
    const f = parseJson(i?.form_answers, null);
    return f && typeof f === 'object' && !Array.isArray(f) ? f : null;
  }

  /** [R2-B4] اختيارات الموقع كما تعرض للإدارة (تحت STAFF_LINES_TITLE): ضغطات على صور، كلامها هو الأهم */
  function formOf(i) {
    const f = formJson(i);
    if (!f) return null;
    const t = topicByKey(f.topic);
    const about = f.about && typeof f.about === 'object' ? f.about : null;
    return {
      title: STAFF_LINES_TITLE,
      topic: t?.key || null,
      topic_label: t?.staff || null,
      entry: f.entry || null,
      mode: f.mode || null,
      callback: f.callback || null,
      callback_label: f.callback && CALLBACK_WHEN[f.callback] ? CALLBACK_WHEN[f.callback].staff : null,
      story: f.story || null,
      lines: staffLines(f),
      urgent_hint: !!f.inferred?.urgent_hint || f.answers?.['rent.evict'] === 'yes',
      about: about
        ? {
            governorate: about.governorate || null,
            relation: about.relation || null,
            relation_label: about.relation ? LABELS.beneficiary_relation?.[about.relation] || about.relation : null,
          }
        : null,
    };
  }

  /** رسائل البريد الصادر للقصة مرة واحدة لكل طلب (notices_sent) — مقارنة وتبديل حتى لا يتكرر التنبيه */
  function claimNotice(intakeId, key) {
    const i = db.get('SELECT notices_sent FROM intakes WHERE id = ?', intakeId);
    if (!i) return false;
    const set = parseJson(i.notices_sent, []);
    const list = Array.isArray(set) ? set : [];
    if (list.includes(key)) return false;
    const r = db.run("UPDATE intakes SET notices_sent = ? WHERE id = ? AND COALESCE(notices_sent, '') = ?", JSON.stringify([...list, key]), intakeId, i.notices_sent || '');
    return r.changes === 1;
  }

  /** إرسال رسالة آلية ثابتة للقصة (واتساب فقط، داخل النافذة، بلا تصفير غير المقروء) — لا يكسر أبدًا */
  function sendAuto(i, rule, body, meta = {}) {
    try {
      const wa = { session_only: true, ...(meta.wa || {}) };
      return app.engine.sendToClient({
        client_id: i.client_id,
        intake_id: i.id,
        body,
        channel: 'whatsapp',
        automated: true,
        rule,
        keep_unread: true,
        meta: { ...meta, wa },
      });
    } catch (e) {
      app.log(`story auto message ${rule} failed`, e);
      return null;
    }
  }

  const svc = {
    STORY_VIEW_SQL,
    formOf,

    /** [R2-A3] هل تضيف الرسالة شيئًا إلى القصة؟ (انظر engine.isFactual) */
    isFactual: (msg, text, ctx) => isFactual(msg, text, { doneWords: setting('story_done_words'), ...(ctx || {}) }),

    /**
     * نص القصة: clientText للمحلل المحلي والتشابه (كلامها فقط)، وcontextText لـ Claude (مع العلامات ورسائل المؤسسة).
     * بلا رسائل صوتية ولا موضوع ولا اختيارات موقع ولا علامات = نص الإصدار 9.1 حرفيًا.
     * @returns {{ clientText, contextText, voice:{total,done,missing}, meaningfulLetters, typedLetters, blocked, hasMedia, mediaFailed }}
     */
    storyText(intakeId) {
      const intake = db.get('SELECT * FROM intakes WHERE id = ?', intakeId);
      if (!intake) throw notFound('الطلب غير موجود');
      const doneWords = setting('story_done_words');
      const msgs = db.all('SELECT id, direction, body, meta, automated, status FROM messages WHERE intake_id = ? ORDER BY id', intakeId);
      const docs = db.all('SELECT id, message_id, filename, mime, uploaded_by_kind FROM documents WHERE intake_id = ? ORDER BY id', intakeId);
      const trs = new Map(
        db
          .all('SELECT t.document_id, t.status, t.text, t.duration_seconds FROM voice_transcripts t JOIN documents d ON d.id = t.document_id WHERE d.intake_id = ?', intakeId)
          .map((t) => [t.document_id, t]),
      );
      const audioByMsg = new Map();
      for (const d of docs) {
        if (!d.message_id || d.uploaded_by_kind !== 'client' || !/^audio\//.test(String(d.mime || ''))) continue;
        if (!audioByMsg.has(d.message_id)) audioByMsg.set(d.message_id, []);
        audioByMsg.get(d.message_id).push(d);
      }
      const client = [];
      const context = [];
      const typed = [];
      const voice = { total: 0, done: 0, missing: 0 };
      let mediaFailed = false;
      let factualSeen = false;
      let cannedOnly = false;
      for (const m of msgs) {
        const meta = parseJson(m.meta, {});
        if (m.direction === 'out') {
          // [S-14] رسائل الموظفين (لا الآلية ولا الفاشلة) في سياق Claude فقط، لا في نص المحلل المحلي
          if (!m.automated && m.status !== 'failed' && String(m.body || '').trim()) context.push(`— رسالة من المؤسسة: ${truncate(m.body, 300)}`);
          continue;
        }
        if (meta.story_done) continue;
        if (meta.topic) {
          const label = topicByKey(meta.topic)?.staff || meta.topic;
          context.push(meta.topic_prefill ? `[اختارت الموضوع من رسالة الموقع الجاهزة: ${label}]` : `[اختارت الموضوع من القائمة: ${label}]`);
          continue;
        }
        if (meta.call_note) {
          const t = String(m.body || '').trim();
          if (t) {
            context.push(`(مكالمة — كتبتها الإدارة): ${t}`);
            client.push(t);
            factualSeen = true;
          }
          continue;
        }
        if (isCannedCallback(meta, m.body)) cannedOnly = true;
        const text = factsText(m.body, meta);
        const audio = audioByMsg.get(m.id) || [];
        const media = Array.isArray(meta.media) ? meta.media : [];
        const isVoice = media.some((x) => x?.kind === 'audio') || String(m.body || '').trim() === VOICE_PLACEHOLDER || audio.length > 0;
        if (!isVoice) {
          if (text.trim()) {
            client.push(text);
            context.push(text);
            typed.push(text);
          }
          continue;
        }
        const placeholderOnly = text.trim() === VOICE_PLACEHOLDER;
        if (!placeholderOnly && text.trim()) {
          client.push(text);
          context.push(text);
          typed.push(text);
        }
        const ctxLines = [];
        const clientLines = [];
        if (!audio.length) {
          // الرسالة الصوتية لم تُنزَّل بعد (أو فشل تنزيلها): ناقصة حتى تُسمع
          voice.total += 1;
          voice.missing += 1;
          if (meta.media_failed) mediaFailed = true;
          ctxLines.push('[رسالة صوتية لم تُكتب بعد]');
          if (placeholderOnly) clientLines.push(VOICE_PLACEHOLDER);
        }
        for (const d of audio) {
          voice.total += 1;
          const tr = trs.get(d.id);
          if (tr?.status === 'confirmed' && String(tr.text || '').trim()) {
            voice.done += 1;
            ctxLines.push(`(رسالة صوتية — نص كتبته الإدارة): ${String(tr.text).trim()}`);
            clientLines.push(String(tr.text).trim());
          } else if (tr?.status === 'unclear') {
            voice.done += 1;
            ctxLines.push('[رسالة صوتية غير مفهومة]');
          } else {
            voice.missing += 1;
            const secs = Number(tr?.duration_seconds);
            ctxLines.push(`[رسالة صوتية لم تُكتب بعد${Number.isFinite(secs) && secs > 0 ? `، مدتها ${Math.round(secs)} ثانية` : ''}]`);
          }
        }
        context.push(...ctxLines);
        client.push(...clientLines);
      }
      let clientText = client.filter((s) => String(s).trim()).join('\n');
      let contextText = context.filter((s) => String(s).trim()).join('\n');
      if (docs.length) {
        const line = `[مرفقات مرسلة: ${docs.map((d) => d.filename).join('، ')}]`;
        clientText += `\n${line}`;
        contextText += `\n${line}`;
      }
      const lines = staffLines(formJson(intake) || {});
      if (lines.length) contextText = `[${STAFF_LINES_TITLE}: ${lines.join(' · ')}]\n${contextText}`;
      const meaningful = lettersOf(clientText, doneWords);
      const typedLetters = lettersOf(typed.join('\n'), doneWords);
      const otherMedia = docs.some((d) => d.uploaded_by_kind === 'client' && !/^audio\//.test(String(d.mime || '')));
      const form = formJson(intake);
      let blocked = null;
      if (!factualSeen && Number(intake.story_rev) === 0 && voice.total === 0 && meaningful === 0 && (form?.callback || cannedOnly)) blocked = 'no_story';
      else if (voice.missing > 0 && meaningful < 60) blocked = mediaFailed ? 'media_failed' : 'voice';
      return { clientText, contextText, voice, meaningfulLetters: meaningful, typedLetters, blocked, hasMedia: voice.total > 0 || otherMedia, mediaFailed };
    },

    /** [§3.5] العدادات المخزنة للقصة (رسائل صوتية لم تُكتب، حروف القصة، فشل تنزيل) — بعد كل وارد أو نص أو مكالمة أو نقل */
    recompute(intakeId) {
      if (!intakeId) return null;
      const st = svc.storyText(intakeId);
      db.run('UPDATE intakes SET voice_missing = ?, story_letters = ?, media_failed = ? WHERE id = ?', st.voice.missing, st.meaningfulLetters, st.mediaFailed ? 1 : 0, intakeId);
      return st;
    },

    /**
     * [R2-B20/B21/S-31] كلمات رسائلها: {hello} «أهلًا يا {الاسم}» (اسم من الموقع أو الإدارة فقط، لا اسم ملف واتساب) أو «أهلًا بيك{ي}»،
     * و{ref_no} «طلب رقم 29» (لا REQ-… في واتساب).
     */
    words(intake) {
      const i = typeof intake === 'object' ? intake : db.get('SELECT * FROM intakes WHERE id = ?', intake);
      const c = i?.client_id ? app.clients.get(i.client_id) : null;
      let name = '';
      if (i && isPortalUnverifiedIntake(i)) name = i.contact_name || '';
      else if (c?.name && (!c.name_source || ['website', 'staff'].includes(c.name_source))) name = c.name;
      const first = addressName(name);
      const form = addressForm({ name, address_form: c?.address_form });
      const num = /^REQ-\d{4}-0*(\d+)$/.exec(String(i?.code || ''))?.[1] || '';
      return {
        first_name: first,
        form,
        hello: genderize(first ? `أهلًا يا ${first}` : 'أهلًا بيك{ي}', form),
        ref_no: num ? `طلب رقم ${num}` : '',
        ref_number: num,
        org_name: setting('org_name') || 'مؤسسة بيوت مصر',
        org_phone: setting('org_phone') || '',
        office_hours: setting('office_hours') || '',
      };
    },

    /** ملء نص لها بالمتغيرات ثم رموز النوع (المتغيرات الناقصة تبقى كما هي: {org_phone} الفارغ يمنع الإرسال) */
    fill(template, intake, extra = {}) {
      const w = svc.words(intake);
      const values = { hello: w.hello, ref_no: w.ref_no, org_name: w.org_name, org_phone: w.org_phone, office_hours: w.office_hours, first_name: w.first_name, client_name: w.first_name, ref: w.ref_number, request_code: intake?.code, ...extra };
      let text = String(template ?? '');
      // [S-31] رد جاهز يبدأ «أهلًا {client_name}» واسمها غير مسموح (اسم ملف واتساب): «أهلًا بيك{ي}» بدل متغير يمنع الإرسال
      if (!w.first_name && !extra.client_name) text = text.replace(/أهل(?:ًا|اً|ا)\s*(?:يا\s*)?\{client_name\}/g, '{hello}').replace(/\s*\{client_name\}/g, '');
      return app.engine.fillClientText(text, values, w.form);
    },

    /**
     * [R2-A4/A5] الرسائل الآلية (ترحيب، طلب الحكاية، «وصلتنا حكايتك») لقصة بدأت من واتساب بعد تشغيل 9.2،
     * لم يكلمها فيها أحد من الإدارة بعد، وليس لها طلب آخر مفتوح (أو طلب موقع غير مؤكد) خلال 30 يومًا ولا ملف مفتوح.
     */
    autoEligible(intake) {
      const i = typeof intake === 'object' ? intake : db.get('SELECT * FROM intakes WHERE id = ?', intake);
      if (!i || i.first_channel !== 'whatsapp' || !i.client_id) return false;
      const since = setting('stories_since');
      if (since && String(i.created_at) < String(since)) return false;
      if (db.get("SELECT 1 FROM messages WHERE intake_id = ? AND direction = 'out' AND automated = 0", i.id)) return false;
      return !svc.otherOpen(i);
    },

    /** طلب آخر مفتوح لنفس المستفيدة (أو طلب موقع غير مؤكد خلال 30 يومًا) أو ملف مفتوح: { kind, id, code } أو null */
    otherOpen(i) {
      const since = isoMinus(nowIso(), 30 * 24 * HOUR);
      const other = db.get(
        `SELECT id, code FROM intakes o WHERE o.client_id = ? AND o.id != ? AND o.created_at >= ?
           AND (o.status IN ${OPEN_SQL} OR ${portalUnverifiedSql('o')}) ORDER BY o.id DESC LIMIT 1`,
        i.client_id,
        i.id,
        since,
      );
      if (other) return { kind: 'intake', id: other.id, code: other.code };
      const kase = db.get("SELECT c.id, c.code, i2.code AS ref FROM cases c LEFT JOIN intakes i2 ON i2.id = c.intake_id WHERE c.client_id = ? AND c.status != 'closed' AND (c.intake_id IS NULL OR c.intake_id != ?) ORDER BY c.id DESC LIMIT 1", i.client_id, i.id);
      if (kase) return { kind: 'case', id: kase.id, code: kase.ref || kase.code };
      const m = db.get("SELECT id, code FROM matters WHERE client_id = ? AND status != 'closed' ORDER BY id DESC LIMIT 1", i.client_id);
      if (m) return { kind: 'matter', id: m.id, code: m.code };
      return null;
    },

    // ───────────── الجدولة (§6.3) ─────────────
    /**
     * جدولة التحليل حسب الحدث وحالة القصة وقواعد التكلفة. events: collecting | ready | transcript | rerun.
     * يعيد true إن جُدول تحليل (أو ملخص مبدئي).
     */
    scheduleAnalysis(intakeId, event = 'ready') {
      const i = db.get('SELECT id, status, story_state, story_rev, analyzed_rev, voice_missing FROM intakes WHERE id = ?', intakeId);
      if (!i || !OPEN.includes(i.status)) return false;
      const claude = claudeMode();
      const collecting = i.story_state === 'collecting';
      if (event === 'collecting' || ((event === 'transcript' || event === 'rerun') && collecting)) {
        // أثناء الكتابة: محليًا تحليل كامل كما في 9.1؛ مع Claude ملخص مبدئي محلي فقط
        app.ai.scheduleIntakeAnalysis(i.id, 300, claude ? { preview: true } : {});
        return true;
      }
      if (!(Number(i.analyzed_rev) < Number(i.story_rev))) return false;
      if (event === 'transcript' && claude) {
        // [R2-A15] نصوص الرسائل الصوتية تُكتب متتابعة: تحليل Claude واحد بعد آخرها (60 ثانية) وفقط حين لا يبقى صوت ناقص
        if (Number(i.voice_missing) === 0) app.ai.scheduleIntakeAnalysis(i.id, 60 * 1000);
        else app.ai.scheduleIntakeAnalysis(i.id, 300, { preview: true });
        return true;
      }
      app.ai.scheduleIntakeAnalysis(i.id, claude ? 4000 : 300);
      return true;
    },

    /** مؤقت «السكوت» لقصة تُكتب (يُعاد ضبطه مع كل رسالة منها؛ المهمة الدورية تغطي إعادة التشغيل) */
    armQuiet(intakeId) {
      clearTimeout(quietTimers.get(intakeId));
      const t = setTimeout(() => {
        quietTimers.delete(intakeId);
        try {
          const i = db.get('SELECT story_state, status, last_inbound_at, created_at FROM intakes WHERE id = ?', intakeId);
          if (!i || i.story_state !== 'collecting' || !OPEN.includes(i.status)) return;
          if ((i.last_inbound_at || i.created_at) > isoMinus(nowIso(), quietMinutes() * MIN)) return;
          svc.markReady(intakeId, 'quiet');
        } catch (e) {
          app.log('story quiet timer failed', e);
        }
      }, quietMinutes() * MIN + 2000);
      t.unref?.();
      quietTimers.set(intakeId, t);
    },
    clearQuietTimers(intakeId = null) {
      if (intakeId === null || intakeId === undefined) {
        for (const t of quietTimers.values()) clearTimeout(t);
        quietTimers.clear();
      } else {
        clearTimeout(quietTimers.get(intakeId));
        quietTimers.delete(intakeId);
      }
    },
    /** إلغاء مؤقتات القصص والتحليل (كلها أو لطلب واحد) — app.close وبعد اعتماد القرار */
    cancelTimers(intakeId = null) {
      app.ai?.cancelTimers ? app.ai.cancelTimers(intakeId) : svc.clearQuietTimers(intakeId);
    },

    // ───────────── بعد كل رسالة واردة ─────────────
    /** [R2-A14] يُستدعى من engine.receive بعد الحفظ (لا يُسقط الاستقبال أبدًا) */
    afterInbound(result, msg) {
      const intake = result?.intake;
      if (!intake?.id) return;
      svc.recompute(intake.id);
      const s = result.story || {};
      const i = row(intake.id);
      if (!i) return;
      const open = OPEN.includes(i.status) && !result.caseRow;
      if (!open) return;
      if (!s.staff_entry) {
        // ما تسجله الإدارة (مكالمة، نقل رسائل) يُحلَّل فورًا من مساره؛ هنا رسائلها هي فقط
        if (i.story_state === 'collecting') {
          svc.armQuiet(i.id);
          if (s.factual) svc.scheduleAnalysis(i.id, 'collecting');
        } else if (s.factual) {
          svc.scheduleAnalysis(i.id, 'ready');
        }
      }
      if (s.done) svc.markReady(i.id, 'client_done');
      if (msg?.channel === 'whatsapp' && !s.staff_entry) {
        if (result.created_intake) svc.maybeWelcome(row(i.id), result);
        if (s.topic && !s.topic_prefill) svc.maybeNudge(row(i.id));
      }
    },

    /** [A92-05] ترحيب بقائمة المواضيع لأول رسالة في قصة واتساب جديدة (متوقف افتراضيًا) */
    maybeWelcome(i, result) {
      if (!i || !setting('story_welcome_enabled')) return false;
      if (result.identity_confirm || result.story?.mentioned_ref || result.story?.topic_prefill) return false;
      if (!svc.autoEligible(i)) return false;
      const since = isoMinus(nowIso(), 24 * HOUR);
      if (db.get("SELECT 1 FROM messages WHERE client_id = ? AND direction = 'out' AND created_at >= ?", i.client_id, since)) return false;
      const claim = db.run('UPDATE intakes SET welcome_sent_at = ? WHERE id = ? AND welcome_sent_at IS NULL', nowIso(), i.id);
      if (claim.changes !== 1) return false;
      return !!sendAuto(i, 'story_welcome', svc.fill(CLIENT_TEXTS.story_welcome, i), { portal_hidden: true, wa: svc.welcomeList(i) });
    },

    /** القائمة التفاعلية للترحيب (حدود واتساب: الرأس والتذييل 60، الزر 20، القسم 24، الصف 24، الوصف 72، النص 1024) */
    welcomeList(i) {
      const w = svc.words(i);
      const g = (t) => genderize(svc.fill(t, i), w.form);
      return {
        type: 'list',
        header: g(CLIENT_TEXTS.story_welcome_header).slice(0, 60),
        text: g(CLIENT_TEXTS.story_welcome).slice(0, 1024),
        footer: g(CLIENT_TEXTS.story_welcome_footer).slice(0, 60),
        button: g(CLIENT_TEXTS.story_welcome_button).slice(0, 20),
        sections: [
          {
            title: g(CLIENT_TEXTS.story_welcome_section).slice(0, 24),
            rows: TOPICS.map((t) => ({ id: `topic:${t.key}`, title: String(t.wa_title).slice(0, 24), description: genderize(t.wa_desc, w.form).slice(0, 72) })),
          },
        ],
      };
    },

    /** [A92-06] بعد اختيار الموضوع من القائمة بلا حكاية بعد: «احكيلنا حصل إيه» مرة واحدة (مع الترحيب فقط) */
    maybeNudge(i) {
      if (!i || !setting('story_welcome_enabled') || !svc.autoEligible(i)) return false;
      const st = svc.storyText(i.id);
      if (st.meaningfulLetters >= 25 || st.hasMedia) return false;
      if (db.get("SELECT 1 FROM messages WHERE intake_id = ? AND automation_rule = 'story_topic_nudge'", i.id)) return false;
      return !!sendAuto(i, 'story_topic_nudge', svc.fill(CLIENT_TEXTS.story_topic_nudge, i), { portal_hidden: true });
    },

    /**
     * [R2-A10] القصة اكتملت (سكوت / «خلاص» / «لخّصها الآن»): مقارنة وتبديل، ثم الجدولة والعاجل والتأكيد لها.
     * قصة بلا وقائع (story_rev = 0) تتغير حالتها فقط. opts.analyze=false: المستدعي يحلل بنفسه فورًا.
     */
    markReady(intakeId, via, actor = null, { analyze = true } = {}) {
      const t = nowIso();
      const r = db.run(
        `UPDATE intakes SET story_state = 'ready', story_ready_at = ?, story_ready_via = ? WHERE id = ? AND story_state = 'collecting' AND status IN ${OPEN_SQL}`,
        t,
        via,
        intakeId,
      );
      if (r.changes !== 1) return { marked: false, scheduled: false };
      svc.clearQuietTimers(intakeId);
      const i = row(intakeId);
      app.activity.log({
        intake_id: i.id,
        client_id: i.client_id,
        actor: actor || { kind: via === 'client_done' ? 'client' : 'system' },
        type: 'story.ready',
        summary: `اكتملت القصة (${LABELS.story_ready_via[via] || via})`,
        data: { via, rev: i.story_rev },
      });
      if (!Number(i.story_rev)) return { marked: true, scheduled: false };
      let scheduled = false;
      if (analyze && Number(i.analyzed_rev) < Number(i.story_rev)) scheduled = svc.scheduleAnalysis(i.id, 'ready');
      svc.urgentCheck(i.id);
      if (via === 'quiet' || via === 'client_done') svc.maybeAck(i);
      return { marked: true, scheduled };
    },

    /** «وصلتنا حكايتك، وده طلب رقم 29» (متوقف افتراضيًا): مرة واحدة لكل طلب، لقصة فيها كلام أو صوت أو صورة */
    maybeAck(i) {
      if (!setting('story_ack_enabled') || !svc.autoEligible(i)) return false;
      const st = svc.storyText(i.id);
      if (!(st.meaningfulLetters >= 25 || st.hasMedia)) return false;
      const claim = db.run('UPDATE intakes SET story_ack_sent_at = ? WHERE id = ? AND story_ack_sent_at IS NULL', nowIso(), i.id);
      if (claim.changes !== 1) return false;
      let text = svc.fill(CLIENT_TEXTS.story_ack, i);
      if (officeOpen() === false) text += svc.fill(CLIENT_TEXTS.story_ack_closed, i);
      return !!sendAuto(i, 'story_ack', text);
    },

    /** [R2-A10] قصة جاهزة وآخر تحليل كامل لها عاجل ← تنبيه واحد للإدارة (محليًا أو بـ Claude) */
    urgentCheck(intakeId) {
      const i = row(intakeId);
      if (!i || !OPEN.includes(i.status) || i.story_state !== 'ready') return false;
      const sug = app.ai.latest('intake', i.id, 'intake_analysis');
      if (!sug || sug.output.blocked || !['high', 'urgent'].includes(sug.output.urgency)) return false;
      if (!claimNotice(i.id, 'urgent_ready')) return false;
      app.activity.log({ intake_id: i.id, client_id: i.client_id, actor: { kind: 'ai' }, type: 'story.urgent_ready', summary: 'قصة عاجلة جاهزة للقرار', data: { suggestion_id: sug.id } });
      app.notifications.notifyStaff({
        type: 'story.urgent_ready',
        title: `قصة عاجلة جاهزة للقرار — ${i.code}`,
        body: truncate(sug.output.one_line || sug.output.title || '', 140),
        link: `#/inbox/${i.id}`,
      });
      return true;
    },

    // ───────────── المهمة الدورية «تلخيص القصص المكتملة» ─────────────
    /** [R2-A15] تجدول فقط ولا تنتظر أي تحليل. يعيد { marked, scheduled, media_retried, notices } */
    checkReady() {
      const now = nowIso();
      const out = { marked: 0, scheduled: 0, media_retried: 0, notices: 0 };
      const marked = new Set();
      // (a) قصص سكتت مدة السكوت ← جاهزة (الأقدم أولًا، 20 في كل مرة)
      const cutoff = isoMinus(now, quietMinutes() * MIN);
      for (const r of db.all(
        `SELECT id FROM intakes WHERE story_state = 'collecting' AND status IN ${OPEN_SQL} AND COALESCE(last_inbound_at, created_at) <= ?
         ORDER BY COALESCE(last_inbound_at, created_at), id LIMIT 20`,
        cutoff,
      )) {
        const m = svc.markReady(r.id, 'quiet');
        if (m.marked) {
          out.marked += 1;
          marked.add(r.id);
          if (m.scheduled) out.scheduled += 1;
        }
      }
      // (b) [R2-A1] جاهزة ولم تُحلَّل مراجعتها الحالية: حتى 3 محاولات لكل مراجعة، بينها 10 دقائق
      const ago10 = isoMinus(now, 10 * MIN);
      for (const r of db.all(
        `SELECT id FROM intakes WHERE story_state = 'ready' AND status IN ${OPEN_SQL} AND analyzed_rev < story_rev AND analysis_attempts < 3
           AND (analysis_attempted_at IS NULL OR analysis_attempted_at < ?) ORDER BY id LIMIT 50`,
        ago10,
      )) {
        if (marked.has(r.id) || app.ai.hasTimer?.(r.id)) continue;
        if (svc.scheduleAnalysis(r.id, 'ready')) out.scheduled += 1;
      }
      // (c) [R2-A2] وسائط واتساب معلقة أو فشل تنزيلها (حتى 7 أيام): إعادة محاولة، 10 في كل مرة، ومرة كل 10 دقائق للرسالة
      if (app.whatsapp?.configured) {
        for (const m of db.all(
          `SELECT m.id, m.client_id, m.intake_id, m.case_id, m.meta FROM messages m
           WHERE m.direction = 'in' AND m.channel = 'whatsapp' AND m.created_at >= ?
             AND (json_extract(m.meta, '$.pending_media') IS NOT NULL OR json_extract(m.meta, '$.media_failed') = 1)
             AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.message_id = m.id)
             AND (json_extract(m.meta, '$.media_retry_at') IS NULL OR json_extract(m.meta, '$.media_retry_at') < ?)
           ORDER BY m.id LIMIT 10`,
          isoMinus(now, 7 * 24 * HOUR),
          ago10,
        )) {
          const meta = parseJson(m.meta, {});
          const items = (Array.isArray(meta.pending_media) ? meta.pending_media : Array.isArray(meta.media) ? meta.media : []).filter((x) => x?.media_id);
          if (!items.length) continue;
          db.run("UPDATE messages SET meta = json_set(meta, '$.media_retry_at', ?) WHERE id = ?", now, m.id);
          const res = { client: { id: m.client_id }, intake: m.intake_id ? { id: m.intake_id } : null, caseRow: m.case_id ? { id: m.case_id } : null, message_id: m.id };
          app.engine.fetchWhatsAppMedia(res, items).catch((e) => app.log('media retry', e));
          out.media_retried += 1;
        }
      }
      const open = officeOpen() !== false;
      // (d) [R2-B8] رسالة صوتية لم تُسمع منذ 4 ساعات من اكتمال القصة (أثناء مواعيد العمل)
      if (open) {
        for (const r of db.all(
          `SELECT i.id, i.code, i.client_id, i.story_ready_at FROM intakes i WHERE (${STORY_VIEW_SQL}) = 'blocked' AND i.story_ready_at IS NOT NULL AND i.story_ready_at <= ?
             AND COALESCE(i.notices_sent, '') NOT LIKE '%"voice_waiting"%' ORDER BY i.story_ready_at LIMIT 20`,
          isoMinus(now, 4 * HOUR),
        )) {
          if (!claimNotice(r.id, 'voice_waiting')) continue;
          const hours = Math.max(4, Math.floor((Date.parse(now) - Date.parse(r.story_ready_at)) / HOUR));
          app.notifications.notifyStaff({
            type: 'story.voice_waiting',
            title: `رسالة صوتية لم تُسمع منذ ${arabicCount(hours, ['ساعة', 'ساعتين', 'ساعات', 'ساعة'])} — ${r.code}`,
            body: 'اسمعوا الرسالة واكتبوا ما قالته حتى يُلخَّص الطلب.',
            link: `#/inbox/${r.id}?focus=voice`,
          });
          out.notices += 1;
        }
        // (e) [R2-B7] قصة موقع رقمها غير مؤكد، بانتظار ردها منذ 48 ساعة بعد رسالة على صفحتها فقط، ولم تفتح صفحتها
        for (const r of db.all(
          `SELECT i.id, i.code FROM intakes i WHERE i.status = 'awaiting_client' AND ${portalUnverifiedSql('i')}
             AND COALESCE(i.notices_sent, '') NOT LIKE '%"portal_unseen"%' ORDER BY i.id LIMIT 50`,
        )) {
          const last = db.value("SELECT MAX(created_at) FROM messages WHERE intake_id = ? AND direction = 'out' AND automated = 0 AND channel = 'website'", r.id);
          if (!last || last > isoMinus(now, 48 * HOUR)) continue;
          if (db.get('SELECT 1 FROM portal_tokens WHERE intake_id = ? AND last_used_at IS NOT NULL AND last_used_at > ?', r.id, last)) continue;
          if (!claimNotice(r.id, 'portal_unseen')) continue;
          app.notifications.notifyStaff({
            type: 'story.portal_unseen',
            title: `لم تفتح صفحتها — اتصل بها (${r.code})`,
            body: 'رقمها غير مؤكد فرسالتنا على صفحتها فقط، ولم تفتحها منذ يومين. كلّموها وسجّلوا المكالمة.',
            link: `#/inbox/${r.id}?focus=call`,
          });
          out.notices += 1;
        }
      }
      return out;
    },

    // ───────────── عرض القصة في القائمة والتفاصيل ─────────────
    /** حقول القصة لعنصر قائمة أو تفاصيل (الصف مختار مع story_view من STORY_VIEW_SQL) */
    view(r) {
      const t = topicByKey(r.topic);
      const st = {
        state: r.story_state,
        view: r.story_view || null,
        rev: Number(r.story_rev) || 0,
        analyzed_rev: Number(r.analyzed_rev) || 0,
        new_since_summary: Math.max(0, (Number(r.story_rev) || 0) - (Number(r.analyzed_rev) || 0)),
        ready_at: r.story_ready_at || null,
        ready_via: r.story_ready_via || null,
        ready_via_label: r.story_ready_via ? LABELS.story_ready_via[r.story_ready_via] || r.story_ready_via : null,
        quiet_minutes: quietMinutes(),
        topic: t?.key || null,
        topic_label: t?.staff || null,
        voice: { total: null, missing: Number(r.voice_missing) || 0 },
        media_failed: !!r.media_failed,
        story_letters: Number(r.story_letters) || 0,
        call_attempts: r.call_attempts_count !== undefined ? Number(r.call_attempts_count) || 0 : Number(db.value('SELECT COUNT(*) FROM call_attempts WHERE intake_id = ?', r.id)) || 0,
        welcome_sent_at: r.welcome_sent_at || null,
        ack_sent_at: r.story_ack_sent_at || null,
        decided_track: r.decided_track || null,
        resolution_kind: r.resolution_kind || null,
        resolution_kind_label: r.resolution_kind ? LABELS.resolution_kind[r.resolution_kind] || r.resolution_kind : null,
        referral_to: r.referral_to || null,
      };
      if (r.voice_total !== undefined) st.voice.total = Number(r.voice_total) || 0;
      return st;
    },

    /** حالة القصة الكاملة لطلب (بعد الإجراءات) */
    storyOf(intakeId) {
      const r = requireRow(intakeId);
      const out = svc.view(r);
      out.voice.total = svc.storyText(r.id).voice.total;
      return out;
    },

    /** محاولات الاتصال: العدد والأيام المختلفة (بتوقيت القاهرة) وإمكان الإغلاق «تعذّر الوصول إليها» */
    attempts(intakeId) {
      const rows = db.all(
        'SELECT a.id, a.outcome, a.created_at, u.name AS user_name FROM call_attempts a LEFT JOIN users u ON u.id = a.user_id WHERE a.intake_id = ? ORDER BY a.id',
        intakeId,
      );
      const days = new Set(rows.map((x) => cairoDayKey(x.created_at))).size;
      return {
        count: rows.length,
        days,
        can_close_unreachable: rows.length >= 3 && days >= 2,
        items: rows.map((x) => ({ id: x.id, outcome: x.outcome, outcome_label: LABELS.call_outcome[x.outcome] || x.outcome, user_name: x.user_name || null, created_at: x.created_at })),
      };
    },

    // ───────────── الاقتراح (§6.2) ─────────────
    /** GET /api/admin/intakes/:id/proposal — الاقتراح ومسودة لكل مسار وتحذيرات وإجراء الاتصال */
    proposal(intakeId) {
      const i = requireRow(intakeId);
      const st = svc.storyText(i.id);
      const w = svc.words(i);
      const sug = app.ai.latestStory(i.id);
      const out = sug?.output || null;
      const preview = !!out?.preview;
      const blocked = out?.blocked || (st.blocked ? { voice: 'voice_untranscribed', media_failed: 'media_failed', no_story: 'no_story' }[st.blocked] : null);
      const recommended = STORY_TRACKS.includes(out?.recommended_track) ? out.recommended_track : null;
      const draft = out?.request_draft || {};
      const unconfirmed = isPortalUnverifiedIntake(i);
      const hint = i.client_id && app.engine?.channelHint ? app.engine.channelHint({ clientId: i.client_id, intakeId: i.id }) : { text: '', whatsapp: false, confirmed: false };
      const inWindow = i.client_id ? app.engine.inWindow(i.client_id) : false;
      const client = i.client_id ? app.clients.get(i.client_id) : null;
      const area = out?.legal_area || i.legal_area || topicByKey(i.topic)?.area || 'GEN';
      const title = draft.title || out?.title || i.title || '';
      const priority = ['low', 'normal', 'high', 'urgent'].includes(out?.urgency) && out.urgency !== 'low' ? (rankP(out.urgency) > rankP(i.priority) ? out.urgency : i.priority) : i.priority || 'normal';
      const issues = (out?.suggested_issues || []).map((x) => ({ title: x.title, details: x.details ?? null, legal_area: x.legal_area || area, origin: 'ai' }));
      const fallbackBrief = `المطلوب: رأي مبدئي في: ${issues[0]?.title || title || 'المسألة'}، مع المستندات اللازمة والخطوات العملية للمستفيدة.`;
      const form = formOf(i);
      const internalBits = [draft.internal_note, form?.lines?.length ? `${STAFF_LINES_TITLE}: ${form.lines.join(' · ')}` : null].filter(Boolean);
      const caseDraft = {
        legal_area: area,
        title,
        priority,
        facts_shared: draft.facts_for_lawyer || out?.summary || '',
        facts_internal: internalBits.join('\n') || null,
        brief_draft: draft.brief_for_lawyer || fallbackBrief,
        issues,
        case_manager_id: i.assigned_staff_id || null,
        // [R2-A22] من صف العميل (كما في التحويل اليدوي)، ولا يُقترح أصلًا لطلب موقع رقمه غير مؤكد
        ...(unconfirmed || !client ? {} : { client: { name: client.name || '', governorate: client.governorate || i.governorate || '', national_id: client.national_id || null } }),
      };
      const m = recommended === 'matter' && draft.matter ? draft.matter : { kind: 'litigation', court: null, opponent: null, next_hearing_text: null };
      // الرد على المستفيدة لكل مسار (معبأ مسبقًا بالاسم المسموح ورقم الطلب واسم المؤسسة وصيغة المخاطبة)
      const referrals = Array.isArray(setting('story_referrals')) ? setting('story_referrals') : [];
      let internalReply = null;
      let internalSource = null;
      let internalTitle = null;
      if (recommended === 'internal' && draft.reply_to_her) {
        internalReply = svc.fill(draft.reply_to_her, i);
        internalSource = out.reply_source?.kind === 'quick_reply' ? 'quick_reply' : 'ai';
        internalTitle = out.reply_source?.title || null;
      } else {
        internalReply = svc.fill('{hello}،\n\n— {org_name}', i);
      }
      let referTarget = recommended === 'refer' ? draft.referral_target : null;
      let referReply = recommended === 'refer' && draft.reply_to_her ? svc.fill(draft.reply_to_her, i) : null;
      let referSource = recommended === 'refer' ? (out.reply_source?.kind === 'referral_directory' ? 'referral_directory' : 'ai') : null;
      if (!referReply && referrals[0]) {
        referTarget = referTarget || referrals[0].label;
        referReply = svc.fill(referrals[0].reply || '', i);
        referSource = 'referral_directory';
      }
      const qs = (recommended === 'need_info' && draft.questions_for_her?.length ? draft.questions_for_her : questionsFor(area)).slice(0, 3).map((q) => genderize(q, w.form));
      const numbered = qs.map((q, k) => `${k + 1}. ${q}`).join('\n');
      const drafts = {
        consultation: { case: caseDraft, reply: { send: true, text: svc.fill(CLIENT_TEXTS.story_accepted, i) } },
        matter: {
          case: caseDraft,
          matter: {
            kind: m.kind || 'litigation',
            court: m.court || null,
            opponent: m.opponent || null,
            circuit: null,
            lawsuit_number: null,
            lawsuit_year: null,
            responsible_lawyer_id: null,
            notes: [draft.brief_for_lawyer || fallbackBrief, m.next_hearing_text].filter(Boolean).join('\n'),
          },
          reply: { send: true, text: svc.fill(CLIENT_TEXTS.story_accepted_matter, i) },
        },
        internal: {
          legal_area: area,
          resolution_note: (recommended === 'internal' && draft.resolution_note) || `استفسار عن ${title || 'مسألة إجرائية'}: أُجيبت بالخطوات والمستندات المطلوبة.`,
          reply: { send: true, text: internalReply, source: internalSource, source_title: internalTitle },
        },
        refer: {
          referral_target: referTarget || null,
          resolution_note: (recommended === 'refer' && draft.resolution_note) || (referTarget ? `وُجّهت إلى: ${referTarget}` : ''),
          reply: { send: true, text: referReply || svc.fill('{hello}،\n\n— {org_name}', i), source: referSource },
        },
        need_info: { questions: qs, reply: { send: true, text: svc.fill(CLIENT_TEXTS.story_questions, i, { questions: numbered }) } },
      };
      // التحذيرات
      const warnings = [];
      const add = (code, text) => warnings.push({ code, text });
      if (i.story_view === 'callback') add('callback_only', 'طلبت مكالمة ولم تحكِ مشكلتها بعد — اتصل بها وسجّل المكالمة أولًا.');
      if (unconfirmed) add('unconfirmed', 'رقمها غير مؤكد: أي رسالة ستظهر في صفحة متابعتها فقط ولن تصلها على واتساب.');
      else if (hint.whatsapp && !inWindow) add('out_of_window', 'مرّ أكثر من 24 ساعة على آخر رسالة منها: سيصلها على واتساب إشعار بقالب معتمد، والنص كاملًا في صفحتها.');
      if (st.mediaFailed) add('media_failed', 'تعذّر تنزيل الرسالة الصوتية — اطلبوا منها إعادة إرسالها.');
      if (st.voice.missing > 0) add('voice_missing', `فيها ${arabicCount(st.voice.missing, ['رسالة صوتية واحدة', 'رسالتان صوتيتان', 'رسائل صوتية', 'رسالة صوتية'])} لم تُكتب — الاقتراح مبني على الرسائل المكتوبة فقط.`);
      const voiceOnly = st.voice.total >= 1 && st.typedLetters < 25;
      if (voiceOnly) add('voice_only', 'كل رسائلها صوتية — غالبًا مش بتقرا؛ الأفضل تكلّمها.');
      const newSince = Math.max(0, (Number(i.story_rev) || 0) - (Number(i.analyzed_rev) || 0));
      if (i.story_view === 'stale' && newSince) add('stale', `وصلت ${arabicCount(newSince, ['رسالة جديدة واحدة', 'رسالتان جديدتان', 'رسائل جديدة', 'رسالة جديدة'])} بعد هذا الملخص.`);
      if (i.story_state === 'collecting' && OPEN.includes(i.status)) add('collecting', 'القصة لسه بتتكتب: ممكن تبعت تفاصيل تانية. يمكنك الانتظار أو المتابعة الآن.');
      if (sug && sug.provider !== 'anthropic') add('local', 'هذا اقتراح المحلل المحلي (بدون Claude) — راجعه بعناية.');
      if (!w.org_phone && /\{org_phone\}/.test(drafts.refer.reply.text)) add('no_org_phone', 'رقم المؤسسة غير مضبوط في الإعدادات، فرسالة التوجيه فيها متغير ناقص.');
      const other = i.client_id ? svc.otherOpen(i) : null;
      if (other) add('other_open_request', `لها طلب آخر مفتوح (${other.code}) — راجعوا أو ادمجوا قبل القرار.`);
      // [R2-B7/S-29] الهاتف أولًا حين لا يصلها واتساب (رقم غير مؤكد) أو حين كل رسائلها صوتية
      const callFirst = (unconfirmed && ['internal', 'refer', 'need_info'].includes(recommended)) || voiceOnly;
      let sayDraft = recommended === 'need_info' ? numbered : recommended === 'internal' ? drafts.internal.reply.text : recommended === 'refer' ? drafts.refer.reply.text : null;
      if (sayDraft && recommended !== 'need_info' && isSkeletonDraft(sayDraft)) sayDraft = null;
      return {
        intake_id: i.id,
        code: i.code,
        status: i.status,
        story: { ...svc.view(i), voice: { total: st.voice.total, missing: st.voice.missing } },
        voice: { total: st.voice.total, done: st.voice.done, missing: st.voice.missing },
        suggestion_id: sug && !preview ? sug.id : null,
        provider: sug?.provider || null,
        model: sug?.model || null,
        preview,
        blocked,
        analyzed_at: sug?.created_at || null,
        one_line: out?.one_line || out?.title || null,
        fallback_reason: out?._fallback_reason || null,
        track: { recommended, reason: out?.track_reason || null, confidence: out?.track_confidence ?? null, label: recommended ? LABELS.story_track[recommended] : null },
        // phone: للإدارة فقط (الاقتراح جزء من تفاصيل الطلب، لا يصل للمحامين ولا لقائمة الوارد): رقمها للاتصال من بطاقة الفرز
        identity: { unconfirmed, reply_channel: { text: hint.text, whatsapp: !!hint.whatsapp }, in_window: inWindow, phone: i.contact_phone || (i.client_id ? app.clients.primaryPhone(i.client_id) : null) || null },
        form,
        drafts,
        warnings,
        actions: {
          primary: callFirst ? 'call' : 'sheet',
          call_intro: svc.callIntro(i),
          call_script: callFirst ? sayDraft : null,
        },
        call_attempts: svc.attempts(i.id),
      };
    },

    /** [R2-B9] سطر المكالمة للموظف: «قل: معاكي {المؤسسة} بخصوص طلب رقم 29. اتأكد إنك بتكلمها هي…» */
    callIntro(i) {
      const w = svc.words(i);
      return `قل: معاكي ${w.org_name} بخصوص طلب رقم ${w.ref_number || i.code}. اتأكد إنك بتكلمها هي قبل أي تفاصيل، ولا تذكر الموضوع لغيرها.`;
    },

    // ───────────── اعتماد القرار (§6.2 accept) ─────────────
    /**
     * POST /api/admin/intakes/:id/accept — قرار بنقرة: تحقق قبل أي كتابة ← معاملة واحدة بمقارنة وتبديل ← الإرسال بعد الحفظ.
     */
    async accept(intakeId, body = {}, actor) {
      const i0 = requireRow(intakeId);
      const track = v.oneOf(body.track, STORY_TRACKS, 'المسار', { required: true });
      const force = body.force === true;
      const deliver = body.deliver === undefined || body.deliver === null || body.deliver === '' ? 'message' : v.oneOf(body.deliver, ['message', 'phone'], 'طريقة الإبلاغ');
      if (i0.status === 'converted') throw conflict('هذا الطلب تحول بالفعل إلى ملف', { case_id: i0.case_id });
      if (!OPEN.includes(i0.status)) throw conflict('تم البت في هذا الطلب بالفعل');
      if (!i0.client_id) throw badRequest('لا يوجد عميل مرتبط بالطلب');
      // [مراجعة 9.2] رقم المراجعة إلزامي (إلا مع «متابعة رغم ذلك»): بدونه تسقط مقارنة «وصلت رسائل جديدة بعد فتح الاقتراح»
      const revSeen = body.story_rev === undefined || body.story_rev === null ? (force ? Number(i0.story_rev) : v.int(null, 'رقم مراجعة القصة', { required: true, min: 0 })) : v.int(body.story_rev, 'رقم مراجعة القصة', { min: 0 });
      const suggestionId = body.suggestion_id ? v.int(body.suggestion_id, 'الاقتراح', { min: 1 }) : null;
      // ── 1) التحقق قبل أي كتابة ──
      if (deliver === 'phone') {
        if (!['internal', 'refer'].includes(track)) throw badRequest('الإبلاغ بالمكالمة متاح لرد الإدارة والتوجيه فقط');
        const cn = body.call_note_id ? v.int(body.call_note_id, 'المكالمة', { min: 1 }) : null;
        if (!cn || !db.get("SELECT 1 FROM messages WHERE id = ? AND intake_id = ? AND direction = 'in' AND json_extract(meta, '$.call_note') = 1", cn, i0.id)) {
          throw badRequest('سجّل المكالمة أولًا');
        }
      }
      const reply = body.reply && typeof body.reply === 'object' ? body.reply : {};
      const wantsMessage =
        track === 'need_info' ? true : deliver === 'phone' ? false : ['internal', 'refer'].includes(track) ? reply.send !== false : reply.send === true;
      let text = null;
      let channel = null;
      if (wantsMessage) {
        if (track === 'need_info' && !reply.text) {
          text = null; // يُبنى من الأسئلة أدناه
        } else {
          text = v.str(reply.text, 'نص الرسالة', { required: true, max: 4000 });
        }
      }
      let questions = [];
      if (track === 'need_info') {
        const raw = Array.isArray(body.questions) ? body.questions : [];
        questions = raw.map((q) => (typeof q === 'string' ? q.trim() : '')).filter(Boolean);
        if (!questions.length || questions.length > 3 || raw.length > 3) throw badRequest('اكتب من سؤال إلى ثلاثة أسئلة');
        questions = questions.map((q, k) => v.str(q, `السؤال ${k + 1}`, { required: true, max: 300 }));
        if (!text) text = svc.fill(CLIENT_TEXTS.story_questions, i0, { questions: questions.map((q, k) => `${k + 1}. ${q}`).join('\n') });
      }
      if (wantsMessage) {
        const left = [...new Set([...String(text).matchAll(/\{(\w+)\}/g)].map((x) => x[1]).filter((k) => `{${k}}` !== PORTAL_LINK_VAR))];
        if (left.length) throw badRequest(`الرسالة فيها متغير لم يُملأ: {${left[0]}}`);
        // [R2-A8] قاعدة القناة (B91-01) قبل أي كتابة: واتساب صراحة لرقم غير مؤكد ← 400 ولا شيء يُكتب
        channel = app.engine.pickChannel(i0.client_id, reply.channel || 'auto', { intakeId: i0.id });
      }
      // حقول كل مسار
      let caseBody = null;
      let matterBody = null;
      let legalArea = null;
      let resolutionNote = null;
      let referralTarget = null;
      if (track === 'consultation' || track === 'matter') {
        const cb = body.case && typeof body.case === 'object' ? body.case : {};
        caseBody = { ...cb };
        caseBody.legal_area = v.oneOf(cb.legal_area, AREA_CODES, 'المجال القانوني', { required: true });
        caseBody.title = v.str(cb.title, 'عنوان الملف', { required: true, max: 200 });
        // [R2-A22] بيانات العميل: ما غيّرته الإدارة فقط، ولا شيء لطلب موقع رقمه غير مؤكد (لا تُكتب فوق اسم صاحبة الرقم)
        delete caseBody.client;
        if (cb.client && typeof cb.client === 'object' && !isPortalUnverifiedIntake(i0)) {
          const cur = app.clients.get(i0.client_id) || {};
          const changed = {};
          for (const k of ['name', 'national_id', 'governorate']) {
            if (cb.client[k] === undefined) continue;
            const nv = cb.client[k] === null ? null : String(cb.client[k]).trim();
            if ((nv || null) !== (cur[k] || null)) changed[k] = nv;
          }
          if (Object.keys(changed).length) caseBody.client = changed;
        }
        if (track === 'matter') {
          const mb = body.matter && typeof body.matter === 'object' ? body.matter : {};
          matterBody = { ...mb };
          matterBody.kind = v.oneOf(mb.kind, ENUMS.matter_kind, 'نوع الملف', { required: true });
          const lid = v.int(mb.responsible_lawyer_id, 'المحامي المسؤول', { min: 1 });
          if (lid) {
            const u = db.get("SELECT id, active, invite_pending FROM users WHERE id = ? AND role = 'lawyer'", lid);
            if (!u || !u.active || u.invite_pending) throw badRequest('المحامي المسؤول المختار غير صالح (غير موجود أو موقوف أو لم يفعّل حسابه)');
          }
          matterBody.responsible_lawyer_id = lid;
        }
      } else if (track === 'internal' || track === 'refer') {
        legalArea = body.legal_area !== undefined && body.legal_area !== null && body.legal_area !== '' ? v.oneOf(body.legal_area, AREA_CODES, 'المجال القانوني') : null;
        if (track === 'refer') {
          referralTarget = v.str(body.referral_target, 'الجهة', { required: true, max: 200 });
          resolutionNote = v.str(body.resolution_note, 'ملخص ما تم', { max: 3000 }) || `وُجّهت إلى: ${referralTarget}`;
        } else {
          resolutionNote = v.str(body.resolution_note, 'ملخص ما تم', { required: true, max: 3000 });
        }
      }
      const sug = suggestionId ? app.ai.suggestion(suggestionId) : app.ai.latest('intake', i0.id, 'intake_analysis');
      const recommended = sug && sug.entity_type === 'intake' && sug.entity_id === i0.id && STORY_TRACKS.includes(sug.output?.recommended_track) ? sug.output.recommended_track : null;
      // ── 2) معاملة واحدة ──
      const t = nowIso();
      const decided = db.tx(() => {
        const statuses = track === 'need_info' && !force ? "('new','in_review')" : OPEN_SQL;
        const r = force
          ? db.run(`UPDATE intakes SET decided_track = ?, decided_at = ? WHERE id = ? AND status IN ${statuses}`, track, t, i0.id)
          : db.run(`UPDATE intakes SET decided_track = ?, decided_at = ? WHERE id = ? AND status IN ${statuses} AND story_rev = ?`, track, t, i0.id, revSeen);
        if (r.changes === 0) {
          const now = db.get('SELECT status, story_rev, case_id FROM intakes WHERE id = ?', i0.id);
          if (now.status === 'converted') throw conflict('هذا الطلب تحول بالفعل إلى ملف', { case_id: now.case_id });
          if (!OPEN.includes(now.status)) throw conflict('تم البت في هذا الطلب بالفعل');
          if (track === 'need_info' && now.status === 'awaiting_client' && !force) throw conflict('سبق إرسال أسئلة لم تُجب بعد');
          throw new ApiError(409, 'وصلت رسائل جديدة من المستفيدة بعد فتح الاقتراح. راجعها ثم حاول مرة أخرى، أو تابع رغم ذلك.', 'story_changed', { current_rev: Number(now.story_rev) || 0 });
        }
        const revNow = Number(db.value('SELECT story_rev FROM intakes WHERE id = ?', i0.id)) || 0;
        let kase = null;
        let matter = null;
        if (track === 'consultation' || track === 'matter') {
          kase = app.intakes.convert(i0.id, { ...caseBody, ai_suggestion_id: sug?.id || undefined }, actor);
          db.run('UPDATE cases SET brief_draft = ? WHERE id = ?', v.str(caseBody.brief_draft, 'سؤال المحامي المقترح', { max: 5000 }), kase.id);
          if (track === 'matter') {
            matter = app.matters.createFromCase(kase.id, { ...matterBody, title: kase.title, close_case: false }, actor);
          }
        } else if (track === 'internal' || track === 'refer') {
          app.intakes.handleInternally(i0.id, { resolution_note: resolutionNote, legal_area: legalArea ?? undefined }, actor);
          db.run('UPDATE intakes SET resolution_kind = ?, referral_to = ? WHERE id = ?', track === 'refer' ? 'referral' : 'answered', track === 'refer' ? referralTarget : null, i0.id);
        } else {
          app.intakes.startTriage(i0.id, actor);
          db.run("UPDATE intakes SET status = 'awaiting_client', updated_at = ? WHERE id = ?", t, i0.id);
          app.activity.log({ intake_id: i0.id, client_id: i0.client_id, actor, type: 'story.questions_sent', summary: `أرسل ${actorName(actor)} أسئلة للمستفيدة (${arabicCount(questions.length, ['سؤال واحد', 'سؤالان', 'أسئلة', 'سؤالًا'])})`, data: { questions } });
        }
        if (!i0.title) {
          const ttl = caseBody?.title || sug?.output?.request_draft?.title || sug?.output?.title || null;
          if (ttl && track !== 'consultation' && track !== 'matter') db.run('UPDATE intakes SET title = COALESCE(title, ?) WHERE id = ?', truncate(ttl, 200), i0.id);
        }
        let verdict = null;
        if (recommended) {
          verdict = recommended === track ? 'accepted' : 'corrected';
          app.ai.recordFeedback({
            suggestion_id: sug.id, entity_type: 'intake', entity_id: i0.id, case_id: kase?.id ?? null, field: 'track', verdict,
            ai_value: recommended, final_value: track, actor, note: sug.output.track_reason || null, replace: true,
          });
        }
        app.activity.log({
          intake_id: i0.id,
          case_id: kase?.id,
          matter_id: matter?.id,
          client_id: i0.client_id,
          actor,
          type: 'story.accepted',
          summary: !recommended
            ? `اختار ${actorName(actor)} مسار: ${LABELS.story_track[track]}`
            : recommended === track
              ? `اعتمد ${actorName(actor)} اقتراح الذكاء الاصطناعي: ${LABELS.story_track[track]}`
              : `اختار ${actorName(actor)} مسارًا غير المقترح: ${LABELS.story_track[track]} (المقترح: ${LABELS.story_track[recommended]})`,
          data: { track, recommended, deliver, forced: force, rev_seen: revSeen, rev_now: revNow, suggestion_id: sug?.id ?? null },
        });
        return { kase, matter, verdict, revNow };
      });
      // ── 3) بعد الحفظ: إلغاء المؤقتات، ثم الإرسال (فشل الإرسال لا يلغي القرار) ──
      svc.cancelTimers(i0.id);
      const warnings = [];
      let message = null;
      if (wantsMessage) {
        const meta = {};
        let bodyText = text;
        if (String(text).includes(PORTAL_LINK_VAR)) {
          bodyText = withoutLinkLines(text);
          meta.wa_text = text;
        }
        try {
          let row2;
          if (track === 'need_info') {
            row2 = app.intakes.reply(i0.id, { body: bodyText, channel, await_client: true }, actor, { meta: { ...meta, story_questions: questions, suggestion_id: sug?.id ?? null } });
          } else {
            row2 = app.engine.sendToClient({
              client_id: i0.client_id,
              intake_id: i0.id,
              case_id: decided.kase?.id ?? null,
              body: bodyText,
              channel,
              author: actor,
              meta: { ...meta, story_track: track, suggestion_id: sug?.id ?? null },
            });
            app.activity.log({ intake_id: i0.id, case_id: decided.kase?.id, client_id: i0.client_id, actor, type: 'message.sent', summary: `ردت الإدارة على العميل عبر ${LABELS.channel[row2.channel]}` });
          }
          message = { id: row2.id, channel: row2.channel, status: row2.status, error: row2.error || null };
        } catch (e) {
          app.log('story accept send failed', e);
          message = { id: null, channel, status: 'failed', error: String(e?.message || e) };
          warnings.push({ code: 'send_failed', text: 'تم القرار لكن تعذّر إرسال الرسالة — أعد المحاولة من المحادثة' });
        }
      }
      const fin = db.get('SELECT id, code, status, resolution_kind FROM intakes WHERE id = ?', i0.id);
      const next = decided.matter ? `#/matters/${decided.matter.id}` : decided.kase ? `#/cases/${decided.kase.id}` : `#/inbox/${i0.id}`;
      return {
        track,
        intake: { id: fin.id, code: fin.code, status: fin.status, resolution_kind: fin.resolution_kind || null },
        case: decided.kase ? { id: decided.kase.id, code: decided.kase.code } : null,
        matter: decided.matter ? { id: decided.matter.id, code: decided.matter.code } : null,
        message,
        feedback: decided.verdict ? { track: decided.verdict } : null,
        warnings,
        next,
      };
    },

    // ───────────── المكالمات (§6.2) ─────────────
    /** POST …/call-note — ما قالته في المكالمة يدخل قصتها (رسالة «مكالمة») ويُلخَّص فورًا (محسوب على الحد اليومي) */
    async callNote(intakeId, body = {}, actor) {
      const i = requireRow(intakeId);
      if (!OPEN.includes(i.status)) throw conflict('تم البت في هذا الطلب بالفعل');
      if (!i.client_id) throw badRequest('لا يوجد عميل مرتبط بالطلب');
      const text = v.str(body.text, 'ما قالته المستفيدة في المكالمة', { required: true, min: 1, max: 5000 });
      const ref = clientRef(body.client_ref);
      const r = app.engine.receive({
        channel: 'phone',
        staff_entry: true,
        external_id: `call:${i.id}:${ref}`,
        portal_client_id: i.client_id,
        target_intake_id: i.id,
        text,
        extra_meta: { call_note: true, entered_by: actor.id },
        skip_staff_notice: true,
      });
      if (r.duplicate) {
        return { duplicate: true, message_id: r.message_id, story: svc.storyOf(i.id), proposal: svc.proposal(i.id) };
      }
      app.activity.log({ intake_id: i.id, client_id: i.client_id, actor, type: 'intake.call_logged', summary: `سجّل ${actorName(actor)} ما قالته المستفيدة في المكالمة`, data: { message_id: r.message_id } });
      app.intakes.startTriage(i.id, actor);
      if (body.confirm_identity === true && isPortalUnverifiedIntake(db.get('SELECT * FROM intakes WHERE id = ?', i.id))) {
        app.intakes.confirmIdentity(i.id, actor);
      }
      svc.cancelTimers(i.id);
      try {
        await app.ai.analyzeIntake(i.id, null, { auto: true });
      } catch (e) {
        app.log('call note analysis failed', e);
      }
      return { message_id: r.message_id, story: svc.storyOf(i.id), proposal: svc.proposal(i.id) };
    },

    /** POST …/call-attempt — اتصال لم ينجح (لا رسالة ولا أثر على مهلة أول رد) */
    callAttempt(intakeId, body = {}, actor) {
      const i = requireRow(intakeId);
      if (!OPEN.includes(i.status)) throw conflict('تم البت في هذا الطلب بالفعل');
      const outcome = v.oneOf(body.outcome, CALL_OUTCOMES, 'نتيجة الاتصال', { required: true });
      const ref = body.client_ref === undefined || body.client_ref === null || body.client_ref === '' ? null : clientRef(body.client_ref);
      if (ref) {
        // نفس النقرة مرتين خلال دقيقة ← محاولة واحدة
        const dup = db.get(
          "SELECT 1 FROM activity WHERE intake_id = ? AND type = 'intake.call_attempt' AND json_extract(data, '$.client_ref') = ? AND created_at >= ?",
          i.id,
          ref,
          isoMinus(nowIso(), MIN),
        );
        if (dup) return { duplicate: true, attempts: svc.attempts(i.id) };
      }
      const id = db.insert('call_attempts', { intake_id: i.id, outcome, user_id: actor?.id ?? null, created_at: nowIso() });
      app.activity.log({
        intake_id: i.id,
        client_id: i.client_id,
        actor,
        type: 'intake.call_attempt',
        summary: `حاول ${actorName(actor)} الاتصال بها: ${LABELS.call_outcome[outcome]}`,
        data: { attempt_id: id, outcome, client_ref: ref },
      });
      return { attempts: svc.attempts(i.id) };
    },

    /** POST …/close-unreachable — بعد 3 محاولات في يومين مختلفين على الأقل: «تعذّر الوصول إليها» (لا أرشفة: رابطها يبقى) */
    closeUnreachable(intakeId, actor) {
      const i = requireRow(intakeId);
      if (!OPEN.includes(i.status)) throw conflict('تم البت في هذا الطلب بالفعل');
      const a = svc.attempts(i.id);
      if (!a.can_close_unreachable) throw conflict('لا يمكن الإغلاق قبل 3 محاولات في يومين مختلفين على الأقل');
      const tries = arabicCount(a.count, ['محاولة اتصال واحدة', 'محاولتي اتصال', 'محاولات اتصال', 'محاولة اتصال']);
      const days = arabicCount(a.days, ['يوم واحد', 'يومين', 'أيام', 'يومًا']);
      db.tx(() => {
        app.intakes.handleInternally(i.id, { resolution_note: `تعذّر الوصول إليها بعد ${tries} (${days})` }, actor);
        db.run("UPDATE intakes SET resolution_kind = 'unreachable', decided_at = ? WHERE id = ?", nowIso(), i.id);
        app.activity.log({
          intake_id: i.id,
          client_id: i.client_id,
          actor,
          type: 'intake.unreachable',
          summary: `أُغلق الطلب: تعذّر الوصول إليها بعد ${arabicCount(a.count, ['محاولة واحدة', 'محاولتين', 'محاولات', 'محاولة'])}`,
          data: { attempts: a.count, days: a.days },
        });
      });
      svc.cancelTimers(i.id);
      const fin = db.get('SELECT id, code, status, resolution_kind, resolution_note FROM intakes WHERE id = ?', i.id);
      return { intake: fin, attempts: svc.attempts(i.id) };
    },

    // ───────────── نقل رسائل من ملف مفتوح إلى طلب جديد (§6.2 split) ─────────────
    /** POST /api/admin/messages/split — مشكلة جديدة كتبتها في محادثة ملف مفتوح تصير طلبًا مستقلًا يُلخَّص */
    async split(body = {}, actor) {
      const raw = Array.isArray(body.message_ids) ? body.message_ids : null;
      if (!raw || !raw.length || raw.length > 20) throw badRequest('اختر رسائل واردة من محادثة ملف واحد');
      const ids = v.ids(raw, 'الرسائل');
      const ref = clientRef(body.client_ref);
      const bad = () => badRequest('اختر رسائل واردة من محادثة ملف واحد');
      const msgs = db.all(`SELECT * FROM messages WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ...ids);
      if (msgs.length !== ids.length) throw bad();
      const clientId = msgs[0].client_id;
      // نفس الطلب مرتين (نقرة مزدوجة) ← طلب واحد (قبل التحقق: الرسائل نُقلت بالفعل في المرة الأولى)
      const prev = db.get("SELECT id, code FROM intakes WHERE client_id = ? AND json_extract(source_detail, '$.split_ref') = ?", clientId, ref);
      if (prev) return { duplicate: true, intake: { id: prev.id, code: prev.code } };
      const since = isoMinus(nowIso(), 30 * 24 * HOUR);
      for (const m of msgs) {
        if (m.direction !== 'in' || m.client_id !== clientId || !(m.case_id || m.matter_id) || m.created_at < since) throw bad();
      }
      const docs = db.all(`SELECT id, matter_id FROM documents WHERE message_id IN (${ids.map(() => '?').join(',')})`, ...ids);
      if (docs.length) {
        const granted = db.get(
          `SELECT 1 FROM assignment_grants g JOIN assignments a ON a.id = g.assignment_id
           WHERE g.resource = 'document' AND g.resource_id IN (${docs.map(() => '?').join(',')}) AND a.status != 'withdrawn' LIMIT 1`,
          ...docs.map((d) => d.id),
        );
        if (granted || docs.some((d) => d.matter_id)) throw conflict('فيها مستند ظاهر للمحامي — اسحبه من المحامي أولًا');
      }
      const first = msgs[0];
      const srcCaseId = first.case_id || db.value('SELECT case_id FROM matters WHERE id = ?', first.matter_id) || null;
      const srcCase = srcCaseId ? db.get('SELECT * FROM cases WHERE id = ?', srcCaseId) : null;
      const srcIntake = srcCase?.intake_id ? db.get('SELECT * FROM intakes WHERE id = ?', srcCase.intake_id) : null;
      const srcSd = parseJson(srcIntake?.source_detail, {});
      const sd = { split_ref: ref, split_from: { case_id: srcCaseId, matter_id: first.matter_id || null, message_ids: ids }, entered_by: actor.name };
      for (const k of ['phone_match_unverified', 'identity_confirmed_at', 'identity_confirmed_via', 'sender_verified']) if (srcSd[k] !== undefined) sd[k] = srcSd[k];
      const doneWords = setting('story_done_words');
      const factualCount = msgs.filter((m) => {
        const meta = parseJson(m.meta, {});
        const atts = db.all('SELECT mime FROM documents WHERE message_id = ?', m.id).map((d) => ({ mime: d.mime }));
        return isFactual({ attachments: atts, reply: null }, m.body, { meta, doneWords, confirmOnly: !!meta.identity_confirm && !factsText(m.body, meta).trim() });
      }).length;
      const client = app.clients.get(clientId);
      const t = nowIso();
      const created = db.tx(() => {
        const code = nextCode(t);
        const id = db.insert('intakes', {
          code,
          client_id: clientId,
          status: 'new',
          kind: null,
          first_channel: first.channel,
          last_channel: msgs[msgs.length - 1].channel,
          channels: JSON.stringify([...new Set(msgs.map((m) => m.channel))]),
          source: 'returning',
          source_detail: JSON.stringify(sd),
          legal_area: null,
          contact_name: srcIntake?.contact_name || client?.name || null,
          contact_phone: srcIntake?.contact_phone || app.clients.primaryPhone(clientId),
          governorate: srcIntake?.governorate || client?.governorate || null,
          story_state: 'ready',
          story_ready_at: t,
          story_ready_via: 'staff_entry',
          story_rev: factualCount,
          last_message_at: msgs[msgs.length - 1].created_at,
          last_inbound_at: msgs[msgs.length - 1].created_at,
          created_at: t,
          updated_at: t,
        });
        const ph = ids.map(() => '?').join(',');
        db.run(`UPDATE messages SET intake_id = ?, case_id = NULL, matter_id = NULL WHERE id IN (${ph})`, id, ...ids);
        db.run(`UPDATE documents SET intake_id = ?, case_id = NULL, matter_id = NULL WHERE message_id IN (${ph})`, id, ...ids);
        db.run(`UPDATE voice_transcripts SET intake_id = ?, case_id = NULL WHERE message_id IN (${ph}) OR document_id IN (SELECT id FROM documents WHERE message_id IN (${ph}))`, id, ...ids, ...ids);
        const where = first.matter_id ? `${db.value('SELECT code FROM matters WHERE id = ?', first.matter_id)}` : srcCase?.code || '';
        app.activity.log({ intake_id: id, client_id: clientId, actor, type: 'intake.split', summary: `أنشأ ${actorName(actor)} هذا الطلب من رسالة في الملف ${where}`.trim(), data: { from_case_id: srcCaseId, from_matter_id: first.matter_id || null, message_ids: ids } });
        app.activity.log({
          case_id: srcCaseId,
          matter_id: first.matter_id || null,
          client_id: clientId,
          actor,
          type: 'intake.split',
          summary: `نُقلت ${arabicCount(ids.length, ['رسالة واحدة', 'رسالتان', 'رسائل', 'رسالة'])} إلى طلب جديد ${code}`,
          data: { intake_id: id, message_ids: ids },
        });
        svc.recompute(id);
        return { id, code };
      });
      try {
        await app.ai.analyzeIntake(created.id, null, { auto: true });
      } catch (e) {
        app.log('split analysis failed', e);
      }
      return { intake: created };
    },

    // ───────────── البيانات التجريبية ─────────────
    /**
     * [R2-A15] بعد كل البيانات التجريبية: كل طلب مفتوح مراجعته لم تُحلَّل يُحلَّل محليًا الآن، وكل طلب ينتهي «جاهزًا»
     * ومُحلَّلًا (عدا except: قصص تُكتب الآن عمدًا)، فلا يجد أول تشغيل للمهمة الدورية إلا تلك القصص.
     */
    async settleSeed({ except = [] } = {}) {
      const skip = new Set(except.map(Number));
      svc.cancelTimers();
      const t = nowIso();
      for (const r of db.all('SELECT id, status, story_state, story_rev, analyzed_rev FROM intakes ORDER BY id')) {
        if (skip.has(r.id)) continue;
        if (r.story_state === 'collecting') {
          db.run("UPDATE intakes SET story_state = 'ready', story_ready_at = COALESCE(story_ready_at, last_inbound_at, created_at, ?), story_ready_via = COALESCE(story_ready_via, 'quiet') WHERE id = ?", t, r.id);
        }
        svc.recompute(r.id);
        if (Number(r.analyzed_rev) < Number(r.story_rev)) {
          if (OPEN.includes(r.status)) {
            try {
              await app.ai.analyzeIntake(r.id, null, { forceLocal: true });
            } catch (e) {
              app.log('settleSeed analysis failed', e);
            }
          }
          db.run('UPDATE intakes SET analyzed_rev = MAX(analyzed_rev, story_rev), analysis_attempts = 0 WHERE id = ?', r.id);
        }
      }
      for (const id of skip) {
        try {
          svc.recompute(id);
          app.ai.previewIntake(id);
        } catch (e) {
          app.log('settleSeed preview failed', e);
        }
      }
      svc.cancelTimers();
    },
  };

  /** مفتاح منع التكرار من الواجهة (حروف لاتينية وأرقام، حتى 64) */
  function clientRef(x) {
    const s = typeof x === 'string' ? x.trim() : '';
    if (!s || !CLIENT_REF_RE.test(s)) throw badRequest('مفتاح منع التكرار (client_ref) مطلوب');
    return s;
  }
  function rankP(p) {
    return { low: 0, normal: 1, high: 2, urgent: 3 }[p] ?? 1;
  }
  /** رقم طلب جديد (نفس عداد engine.nextIntakeCode) */
  function nextCode(iso) {
    const y = cairoYear(iso);
    const n = db.nextCounter(`intake:${y}`, 1);
    return `${CODE_PREFIX.intake}-${y}-${String(n).padStart(5, '0')}`;
  }

  // المهمة الدورية: كل دقيقة (تجدول فقط؛ لا تنتظر أي تحليل)
  app.jobs?.register('stories.ready', {
    everyMinutes: 1,
    label: 'تلخيص القصص المكتملة',
    run: async () => svc.checkReady(),
  });

  return svc;
}
