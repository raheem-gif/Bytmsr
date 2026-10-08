// v9.2 (admin-ai) — نصوص الرسائل الصوتية: تسمعها الإدارة وتكتب ما قالته المستفيدة (أو «مش مفهومة»).
// لا تحويل آلي في 9.2 ولا يُرسل أي صوت لـ Claude؛ النص المكتوب يدخل ملخص القصة.
// النصوص للإدارة فقط: لا تظهر للمحامين ولا في صفحة المتابعة (وتدخل في التصدير الكامل للإدارة).
import { nowIso, badRequest, notFound, v } from '../util.js';
import { LABELS } from '../constants.js';

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
    },

    get(documentId) {
      return db.get('SELECT * FROM voice_transcripts WHERE document_id = ?', documentId) || null;
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
          data: { document_id: d.id, status },
        });
        // [R2-A15] محليًا فورًا؛ مع Claude بعد آخر نص (60 ثانية) وفقط حين لا يبقى صوت ناقص، وإلا ملخص مبدئي
        app.stories?.scheduleAnalysis(intake.id, 'transcript');
      } else if (intake?.case_id) {
        app.activity.log({ case_id: intake.case_id, actor, type: 'voice.transcribed', summary: `كتب ${actor?.name || 'الإدارة'} نص رسالة صوتية`, data: { document_id: d.id, status } });
      }
      const fresh = intake ? db.get('SELECT voice_missing FROM intakes WHERE id = ?', intake.id) : null;
      return { ...item(app.documents.get(d.id), svc.get(d.id)), story: { rev, voice_missing: fresh ? Number(fresh.voice_missing) || 0 : null } };
    },
  };
  return svc;
}
