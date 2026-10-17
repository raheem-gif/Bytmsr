// v9.2 (admin-ai) — نصوص الرسائل الصوتية: تسمعها الإدارة وتكتب ما قالته المستفيدة (أو «مش مفهومة»).
// لا تحويل آلي في 9.2 ولا يُرسل أي صوت لـ Claude؛ النص المكتوب يدخل ملخص القصة.
// النصوص للإدارة فقط: لا تظهر للمحامين ولا في صفحة المتابعة (وتدخل في التصدير الكامل للإدارة).
import { nowIso, badRequest, notFound, v } from '../util.js';
import { LABELS } from '../constants.js';
import { sttReason } from '../ai/stt.js'; // v12 media (MD-8)

/** v12 media (L12-60): نتيجة مراجعة المسودة الآلية */
export const AUTO_OUTCOMES = ['accepted', 'edited', 'accepted_unheard', 'edited_unheard', 'rejected'];
const normText = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/** حالات النص المسموح بها في 9.2 (لا CHECK في الجدول: 9.3 تضيف queued/auto_draft/failed) */
export const VOICE_STATUSES = ['pending', 'confirmed', 'unclear'];

/** مدة تسجيل Ogg/Opus (واتساب) بالثواني من موضع آخر صفحة (granule / 48000)، أو null */
export function oggDurationSeconds(buf) {
  if (!buf || buf.length < 27) return null;
  const from = Math.max(0, buf.length - 64 * 1024);
  for (let i = buf.length - 27; i >= from; i--) {
    if (buf[i] === 0x4f && buf[i + 1] === 0x67 && buf[i + 2] === 0x67 && buf[i + 3] === 0x53) {
      const lo = buf.readUInt32LE(i + 6);
      const hi = buf.readUInt32LE(i + 10);
      const granule = hi * 2 ** 32 + lo;
      if (!Number.isFinite(granule) || granule <= 0 || hi === 0xffffffff) return null;
      return Math.round((granule / 48000) * 10) / 10;
    }
  }
  return null;
}

export function createVoice(app) {
  const { db } = app;

  const isClientAudio = (d) => !!d && /^audio\//.test(String(d.mime || '')) && d.uploaded_by_kind === 'client';

  /**
   * v12 media (MD-8): المسودة الآلية للفريق فقط — { state: queued|running|done|empty|failed|skipped|none, text, confidence,
   * provider, error, error_label, outcome, can_run } أو null (التحويل غير مضبوط ولا مسودة: واجهة 11.0)
   */
  function autoOf(d) {
    const stt = app.stt;
    if (!stt) return null;
    const configured = !!stt.configured?.();
    const draft = db.get('SELECT * FROM voice_auto_transcripts WHERE document_id = ?', d.id);
    const job = db.get("SELECT state, error FROM media_jobs WHERE kind = 'stt' AND document_id = ?", d.id);
    if (!configured && !draft) return null;
    let state = draft ? draft.state : 'none';
    if (job && (job.state === 'queued' || job.state === 'running')) state = job.state;
    const error = state === 'failed' || state === 'skipped' ? draft?.error || job?.error || null : null;
    return {
      state,
      text: draft && (draft.state === 'done' || draft.state === 'empty') ? draft.text || '' : null,
      confidence: draft?.confidence ?? null,
      provider: draft?.provider || null,
      seconds: draft?.seconds ?? null,
      error,
      error_label: error ? sttReason(error) : null,
      outcome: draft?.outcome || null,
      updated_at: draft?.updated_at || null,
      can_run: configured,
    };
  }

  function item(d, row) {
    const status = row?.status || 'pending';
    const by = row?.updated_by ? db.value('SELECT name FROM users WHERE id = ?', row.updated_by) || null : null;
    return {
      document_id: d.id,
      message_id: d.message_id ?? null,
      intake_id: d.intake_id ?? null,
      filename: d.filename,
      mime: d.mime,
      created_at: d.created_at,
      duration_seconds: row?.duration_seconds ?? null,
      transcript: {
        status,
        status_label: LABELS.voice_status[status] || status,
        text: row?.text || null,
        updated_by_name: row && row.status !== 'pending' ? by : null,
        updated_at: row?.updated_at || null,
      },
      auto: autoOf(d), // v12 media (MD-8): للفريق فقط (listForIntake/listForCase لا تصل لمحامٍ ولا عميل)
    };
  }

  const svc = {
    VOICE_STATUSES,
    oggDurationSeconds,

    /** documents.save: رسالة صوتية من المستفيدة ← صف «لم تُكتب بعد» (داخل نفس المعاملة) وتحديث عدادات القصة */
    onAudioSaved({ documentId, intakeId = null, caseId = null, messageId = null, seconds = null }) {
      const t = nowIso();
      const secs = Number(seconds);
      db.run(
        `INSERT OR IGNORE INTO voice_transcripts (document_id, intake_id, case_id, message_id, status, duration_seconds, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
        documentId,
        intakeId,
        caseId,
        messageId,
        Number.isFinite(secs) && secs >= 0 ? Math.min(600, secs) : null,
        t,
        t,
      );
      if (intakeId) {
        try {
          app.stories?.recompute(intakeId);
        } catch (e) {
          app.log('voice recompute failed', e);
        }
      }
      // v12 media (MD-6، M12-07): صوت العميل ← مهمة تحويل إلى نص آلي (مسودة للفريق) إن كان التحويل التلقائي مضبوطًا
      app.stt?.onClientAudio?.(documentId);
    },

    get(documentId) {
      return db.get('SELECT * FROM voice_transcripts WHERE document_id = ?', documentId) || null;
    },

    /**
     * v12 media (L12-60): من حفظ PUT …/transcript بـ from_auto ومسودة جاهزة ← outcome وplayed_ratio على المسودة وسطر في سجل
     * الأمان. listened (bool) من المتصفح: شُغّلت الرسالة ≥ 80٪ في هذا الصندوق؛ وplayed_ratio أقل من 0.8 يعني «لم تُسمع».
     * → { outcome, played_ratio } أو null
     */
    recordAutoOutcome(d, body, { status, text, actor, at = nowIso() }) {
      if (!body || body.from_auto !== true || status === 'pending') return null;
      const auto = db.get('SELECT * FROM voice_auto_transcripts WHERE document_id = ?', d.id);
      if (!auto || (auto.state !== 'done' && auto.state !== 'empty')) return null;
      const pr = body.played_ratio === undefined || body.played_ratio === null || body.played_ratio === '' ? NaN : Number(body.played_ratio);
      const played = Number.isFinite(pr) ? Math.round(Math.min(1, Math.max(0, pr)) * 1000) / 1000 : null;
      const heard = body.listened === true && !(played !== null && played < 0.8);
      let outcome = status === 'unclear' ? 'rejected' : normText(text) === normText(auto.text) ? 'accepted' : 'edited';
      if (outcome !== 'rejected' && !heard) outcome = `${outcome}_unheard`;
      db.run('UPDATE voice_auto_transcripts SET outcome = ?, played_ratio = ?, updated_at = ? WHERE document_id = ?', outcome, played, at, d.id);
      const LBL = {
        accepted: 'قبول النص الآلي كما هو',
        edited: 'تعديل النص الآلي ثم تأكيده',
        accepted_unheard: 'قبول النص الآلي دون سماع الرسالة',
        edited_unheard: 'تعديل النص الآلي دون سماع الرسالة',
        rejected: 'تعليم الرسالة بأنها غير مفهومة',
      };
      app.audit?.log({
        actor,
        type: 'voice.transcribed',
        severity: outcome.endsWith('_unheard') ? 'warning' : 'info',
        summary: `${LBL[outcome]} (رسالة صوتية رقم ${d.id})`,
        data: { document_id: d.id, outcome, played_ratio: played },
      });
      return { outcome, played_ratio: played };
    },

    /** الرسائل الصوتية للمستفيدة في طلب (ومنها رسائل ما قبل 9.2 بلا صف: «لم تُكتب بعد») */
    listForIntake(intakeId) {
      const docs = db.all("SELECT * FROM documents WHERE intake_id = ? AND uploaded_by_kind = 'client' AND mime LIKE 'audio/%' ORDER BY id", intakeId);
      return docs.map((d) => item(d, svc.get(d.id)));
    },

    /** نفس العرض لملف أو ملف مستمر (للإدارة فقط) */
    listForCase(caseId) {
      const docs = db.all("SELECT * FROM documents WHERE case_id = ? AND uploaded_by_kind = 'client' AND mime LIKE 'audio/%' ORDER BY id", caseId);
      return docs.map((d) => item(d, svc.get(d.id)));
    },

    /**
     * PUT /api/admin/voice-notes/:documentId/transcript — { text?, unclear?, status? }
     * نص ← «مكتوبة»، unclear ← «غير مفهومة»، فارغ ← رجوع إلى «لم تُكتب بعد». طلب مفتوح: مراجعة جديدة للقصة وملخص؛
     * طلب انتهى أو رسالة في ملف فقط: يُحفظ النص فقط.
     */
    save(documentId, body = {}, actor) {
      const d = app.documents.get(documentId);
      if (!isClientAudio(d)) throw notFound('الرسالة الصوتية غير موجودة');
      if (body.status !== undefined && body.status !== null && !VOICE_STATUSES.includes(body.status)) throw badRequest('حالة غير معروفة للرسالة الصوتية');
      const text = v.str(body.text, 'نص الرسالة الصوتية', { max: 5000 });
      const unclear = body.unclear === true || body.status === 'unclear';
      const status = unclear ? 'unclear' : text ? 'confirmed' : 'pending';
      if (!VOICE_STATUSES.includes(status)) throw badRequest('حالة غير معروفة للرسالة الصوتية');
      const t = nowIso();
      const existing = svc.get(d.id);
      // [بوابة 9.2 R1/S5] نفس النص ونفس الحالة مرة أخرى (حفظ مكرر): لا مراجعة جديدة للقصة ولا تحليل ولا سجل
      if (existing && existing.status === status && String(existing.text || '').trim() === String(unclear ? '' : text || '').trim()) {
        const cur = d.intake_id ? db.get('SELECT story_rev, voice_missing FROM intakes WHERE id = ?', d.intake_id) : null;
        return { ...item(d, existing), unchanged: true, story: { rev: cur ? Number(cur.story_rev) || 0 : null, voice_missing: cur ? Number(cur.voice_missing) || 0 : null } };
      }
      if (existing) {
        db.run('UPDATE voice_transcripts SET status = ?, text = ?, updated_by = ?, updated_at = ?, intake_id = ?, case_id = ?, message_id = COALESCE(message_id, ?) WHERE document_id = ?', status, unclear ? null : text, actor?.id ?? null, t, d.intake_id ?? null, d.case_id ?? null, d.message_id ?? null, d.id);
      } else {
        // [R2-A17] رسالة صوتية من قبل 9.2 بلا صف: يُنشأ الصف عند أول حفظ
        db.run(
          `INSERT INTO voice_transcripts (document_id, intake_id, case_id, message_id, status, text, duration_seconds, updated_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
          d.id,
          d.intake_id ?? null,
          d.case_id ?? null,
          d.message_id ?? null,
          status,
          unclear ? null : text,
          actor?.id ?? null,
          t,
          t,
        );
      }
      // v12 media (L12-60): مراجعة المسودة الآلية — accepted/edited (أو *_unheard إن لم تُسمع الرسالة)، rejected لـ «غير مفهومة»
      const review = svc.recordAutoOutcome(d, body, { status, text, actor, at: t });
      const intake = d.intake_id ? db.get('SELECT id, status, client_id, case_id, story_rev FROM intakes WHERE id = ?', d.intake_id) : null;
      let rev = intake ? Number(intake.story_rev) || 0 : null;
      if (intake && ['new', 'in_review', 'awaiting_client'].includes(intake.status) && !intake.case_id) {
        db.run('UPDATE intakes SET story_rev = story_rev + 1, analysis_attempts = 0 WHERE id = ?', intake.id);
        rev += 1;
        app.stories?.recompute(intake.id);
        app.activity.log({
          intake_id: intake.id,
          client_id: intake.client_id,
          actor,
          type: 'voice.transcribed',
          summary: status === 'unclear' ? `علّم ${actor?.name || 'الإدارة'} رسالة صوتية بأنها غير مفهومة` : status === 'confirmed' ? `كتب ${actor?.name || 'الإدارة'} نص رسالة صوتية` : `أعاد ${actor?.name || 'الإدارة'} رسالة صوتية إلى «لم تُكتب بعد»`,
          data: { document_id: d.id, status, ...(review || {}) },
        });
        // [R2-A15] محليًا فورًا؛ مع Claude بعد آخر نص (60 ثانية) وفقط حين لا يبقى صوت ناقص، وإلا ملخص مبدئي
        app.stories?.scheduleAnalysis(intake.id, 'transcript');
      } else {
        // [بوابة 9.2 S8] طلب انتهى أو رسالة في ملف فقط: يُحفظ النص بلا مراجعة جديدة، لكن يبقى أثر في سجل الطلب أو الملف
        const caseId = intake?.case_id || d.case_id || null;
        const matterId = d.matter_id || null;
        if (intake || caseId || matterId) {
          app.activity.log({
            intake_id: intake?.id ?? null,
            case_id: caseId,
            matter_id: matterId,
            client_id: intake?.client_id ?? d.client_id ?? null,
            actor,
            type: 'voice.transcribed',
            summary: status === 'unclear' ? `علّم ${actor?.name || 'الإدارة'} رسالة صوتية بأنها غير مفهومة` : status === 'confirmed' ? `كتب ${actor?.name || 'الإدارة'} نص رسالة صوتية` : `أعاد ${actor?.name || 'الإدارة'} رسالة صوتية إلى «لم تُكتب بعد»`,
            data: { document_id: d.id, status, after_decision: !!intake, ...(review || {}) },
          });
        }
      }
      const fresh = intake ? db.get('SELECT voice_missing FROM intakes WHERE id = ?', intake.id) : null;
      return { ...item(app.documents.get(d.id), svc.get(d.id)), story: { rev, voice_missing: fresh ? Number(fresh.voice_missing) || 0 : null } };
    },
  };
  return svc;
}
