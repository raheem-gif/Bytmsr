// الإصدار 9.1 — مسار l-work: بيانات تجريبية لوضع الكتابة عند إعادة الرأي (L-03، L-13).
// تُستدعى من src/seed.js (علامة <seed:v91-l-work>) عبر نفس خدمات التشغيل الفعلي.
//
// المحامية رانيا (rania): أعادت الإدارة رأيها في ملف النفقة ومسكن الحضانة بثلاث ملاحظات مرقمة، ومدّدت موعدها يومين،
// وبدأت رانيا نسخة العمل (الإصدار 2) فعالجت الملاحظة الأولى — فيظهر في «رأيي» شريط «ملاحظات الإدارة · عولج 0 من 3»،
// وتعرض «قارن بالإصدار المعاد» الفقرة المعدّلة وحدها.
import { cairoLocalToIso, cairoParts } from './util.js';

const HOUR = 3600 * 1000;

// صورة تخطيطية صغيرة (JPEG ‏480×315) لواجهة المحل المغلق — لعرض «عارض الصور» داخل التطبيق (L-05)
const SHOP_PHOTO_JPEG = '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zGjddbb/AApewuutt/hS9hlWY0s66KTth+YXRSdsPzGjddbb/Cl7C6623+FL2GVZjSzropO2H5hdFJ2w/MaN11tv8KXsLrrbf4UvYZVmNLOuik7YfmF0UnbD8xo3XW2/wpewuutt/hS9hlWY0s66KTth+YXRSdsPzGjddbb/AApewuutt/hS9hlWY0s66KTth+YXRSdsPzexo3XW2/wpewuutt/hS9hlWY0vWhwnQKLDhv0azU0LoPYqXXW2/wAKXsLrrbf4UvY4mmZd3iFsFS6623+FL2F11tv8KXsRhJktgqXXW2/wpewuutt/hS9hhJktgqXXW2/wpewuutt/hS9hhJktgqXXW2/wpewuutt/hS9hhJktgqXXW2/wpewuutt/hS9hhJktgqXXW2/wpewuutt/hS9hhJktgqXXW2/wpewuutt/hS9hhJktgqXXW2/wpewuutt/hS9hhJktgqXXW2/wpewuutt/hS9hhJktgqXXW2/wpewuutt/hS9hhJktgqXXW2/wpewuutt/hS9hhJktklO6623+FL2F2Vtv8KXsMJMn10d+bT/F5m2ZtT1fGoFusaIx7orkdpbp7eZpFkOJAASgAAAAAAAAAAEEgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEEgAAAAAAH//Z';

export const RETURN_NOTES = [
  '1. وضّح كيف تطلب الحاضنة النفقة المؤقتة ومتى يُفصل فيها.',
  '2. اذكر متى ينتهي حق الحاضنة في الاستقلال بمسكن الزوجية.',
  '3. أضف خطوات عملية للأم إن حاول المطلق إخراجها من المسكن بالقوة.',
].join('\n');

/**
 * @param {object} app
 * @param {{ lawyer:object, manager:object, assignmentId:number, realNow:number, setNow:(ms:number)=>void }} ctx
 */
export function seedWorkDemo(app, { lawyer, manager, assignmentId, realNow, setNow, inhCaseId = null, inhLeadId = null }) {
  const { db } = app;
  if (!lawyer || !manager || !assignmentId) return;
  // صورة أرسلتها المستفيدة للمحل المغلق في ملف الميراث، أتاحتها الإدارة للمحامي الأساسي
  if (inhCaseId && inhLeadId) {
    try {
      const c = db.get('SELECT * FROM cases WHERE id = ?', inhCaseId);
      setNow(realNow - 30 * HOUR);
      const docId = app.documents.save(
        { filename: 'صورة_المحل_المغلق.jpg', mime: 'image/jpeg', data_base64: SHOP_PHOTO_JPEG },
        { client_id: c.client_id, case_id: c.id, title: 'صورة المحل المغلق' },
        { kind: 'client' },
      );
      app.visibility.addGrant(inhLeadId, 'document', docId, manager);
    } catch (e) {
      app.log?.('seed l-work photo skipped', e);
    }
  }
  const op = db.get("SELECT * FROM opinions WHERE assignment_id = ? AND status = 'submitted' ORDER BY version DESC LIMIT 1", assignmentId);
  if (!op) return;
  try {
    setNow(realNow - 22 * HOUR);
    app.opinions.returnToLawyer(op.id, manager, { note: RETURN_NOTES });
    // الإدارة تمنح يومين إضافيين للتعديل (6 مساءً)
    const d = cairoParts(new Date(realNow + 2 * 24 * HOUR));
    app.cases.updateAssignment(assignmentId, { due_at: cairoLocalToIso(d.year, d.month, d.day, 18, 0) }, manager);
    setNow(realNow - 3 * HOUR);
    const draft = db.get("SELECT * FROM opinions WHERE assignment_id = ? AND status = 'draft' ORDER BY version DESC LIMIT 1", assignmentId);
    if (!draft) return;
    const first = draft.body.split('\n')[0];
    const revised = draft.body.replace(
      first,
      `${first.replace(/\.$/, '')}، وتطلبها الحاضنة من محكمة الأسرة بطلب مستقل أو ضمن دعوى النفقة، ويُفصل فيه عادة قبل الحكم في الموضوع.`,
    );
    app.opinions.saveDraft(assignmentId, lawyer, { body: revised });
  } catch (e) {
    app.log?.('seed l-work returned opinion skipped', e);
  }
}
