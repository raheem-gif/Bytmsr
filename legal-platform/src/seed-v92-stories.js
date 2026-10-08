// v9.2 (admin-ai) — بيانات العرض: قصص واتساب في كل حالاتها، عبر نفس خدمات المنصة (المحرك، النصوص، «خلاص»، التحليل).
// أشخاص وأرقام وهمية (01092000201…206). «وصلتنا حكايتك» مفعّلة في العرض فقط، والترحيب متوقف كما في الإنتاج.
import fs from 'node:fs';

const asset = (name) => fs.readFileSync(new URL(`./seed-assets/${name}`, import.meta.url)).toString('base64');

/**
 * @param {object} app
 * @param {{ at: (daysAgo:number, hour?:number, minute?:number) => void, setNow?: (ms:number) => void, realNow?: number }} opts
 * @returns {Promise<{ story6Id: number, ids: Record<string, number> }>}
 */
export async function seedStoriesDemo(app, { at, setNow, realNow = Date.now() }) {
  const { db } = app;
  const voice = asset('v91-voice-note.webm');
  const photo = asset('v91-death-certificate.jpg');
  const manager = db.get("SELECT * FROM users WHERE username = 'manager'") || db.get("SELECT * FROM users WHERE role IN ('admin','case_manager') ORDER BY id LIMIT 1");
  // [R2-B21] العرض: «وصلتنا حكايتك» مفعّلة (الترحيب متوقف). القصص التجريبية تبدأ قبل وقت إنشاء قاعدة البيانات، فتُعد من قصص 9.2.
  app.settings.set('story_ack_enabled', true);
  app.settings.set('story_welcome_enabled', false);
  app.settings.set('stories_since', new Date(realNow - 30 * 24 * 3600 * 1000).toISOString());

  let n = 0;
  const wa = (phone, name, text, extra = {}) => {
    return app.engine.receive({
      channel: 'whatsapp',
      external_id: `wamid.SEED.v92.${++n}`,
      from_phone: phone,
      contact_name: name,
      text,
      ...extra,
    });
  };
  const voiceNote = (phone, name) => wa(phone, name, '[رسالة صوتية]', { attachments: [{ filename: `audio-v92-${n + 1}.webm`, mime: 'audio/webm', data_base64: voice, kind: 'audio' }] });
  const settle = async (id) => {
    app.ai.cancelTimers(id);
    await app.ai.analyzeIntake(id);
    app.ai.cancelTimers(id);
  };
  const ids = {};

  // 1) أم مروان — معاش: اختارت «معاش» من القائمة، حكت، رسالة صوتية كتبتها منى السيد، صورة ورقة، ثم «خلاص»
  at(1, 9, 5);
  const p1 = '01092000201';
  let r = wa(p1, 'أم مروان', 'السلام عليكم');
  ids.s1 = r.intake.id;
  wa(p1, 'أم مروان', 'معاش', { reply: { kind: 'interactive', id: 'topic:pen', title: 'معاش' } });
  wa(p1, 'أم مروان', 'جوزي اتوفى من 4 شهور');
  wa(p1, 'أم مروان', 'روحت التأمينات قالولي في مشكلة في الورق');
  r = voiceNote(p1, 'أم مروان');
  const s1Voice = db.get("SELECT id FROM documents WHERE message_id = ? AND mime LIKE 'audio/%'", r.message_id);
  if (s1Voice && manager) {
    app.voice.save(
      s1Voice.id,
      { text: 'هو كان شغال في مصنع وكان متأمن عليه، ولما روحت مكتب التأمينات قالولي اسمه مكتوب غلط في شهادة الوفاة ولازم يتصلح قبل ما يصرفوا المعاش، وأنا معايا تلات عيال' },
      manager,
    );
  }
  wa(p1, 'أم مروان', '[صورة]', { attachments: [{ filename: 'image-v92-1.jpg', mime: 'image/jpeg', data_base64: photo, kind: 'image' }] });
  wa(p1, 'أم مروان', 'خلاص'); // ← اكتملت القصة (كتبت «خلاص») + «وصلتنا حكايتك»
  await settle(ids.s1);

  // 2) أم كريم — قضية حضانة مرفوعة وجلسة محددة، ورسالة صوتية لم تُكتب بعد
  at(1, 11, 20);
  const p2 = '01092000202';
  r = wa(p2, 'أم كريم', 'جالي إعلان من المحكمة');
  ids.s2 = r.intake.id;
  wa(p2, 'أم كريم', 'أبو العيال رافع عليا قضية ضم حضانة');
  wa(p2, 'أم كريم', 'الجلسة يوم 20 الشهر ده في محكمة الأسرة بالمطرية');
  voiceNote(p2, 'أم كريم');
  app.stories.markReady(ids.s2, 'quiet');
  await settle(ids.s2);

  // 3) سعاد — سؤال إجرائي (إعلام الوراثة): ترد الإدارة بالرد الجاهز
  at(1, 13, 40);
  r = wa('01092000203', 'سعاد', 'عايزة أعرف إزاي أطلع إعلام وراثة لجوزي الله يرحمه وإيه الورق المطلوب');
  ids.s3 = r.intake.id;
  app.stories.markReady(ids.s3, 'quiet');
  await settle(ids.s3);

  // 4) أم سارة — مساعدة في مصاريف عملية: خارج الدعم القانوني ← توجيه لبرامج المؤسسة
  at(1, 15, 10);
  r = wa('01092000204', 'أم سارة', 'محتاجة مساعدة في مصاريف عملية لبنتي');
  ids.s4 = r.intake.id;
  app.stories.markReady(ids.s4, 'quiet');
  await settle(ids.s4);

  // 5) منى ع. — «عايزة أسأل على حاجة» و«حاجة تانية» من القائمة: نسألها الأول
  at(1, 17, 30);
  const p5 = '01092000205';
  r = wa(p5, 'منى ع.', 'السلام عليكم');
  ids.s5 = r.intake.id;
  wa(p5, 'منى ع.', 'عايزة أسأل على حاجة');
  wa(p5, 'منى ع.', 'حاجة تانية', { reply: { kind: 'interactive', id: 'topic:other', title: 'حاجة تانية' } });
  app.stories.markReady(ids.s5, 'quiet');
  await settle(ids.s5);

  // 6) أم حسن — القصة لسه بتتكتب: رسالتان قبل الآن بـ 3 و2 دقيقة؛ تكتمل بعد ~8 دقائق عبر المهمة الدورية
  if (setNow) setNow(realNow - 3 * 60 * 1000);
  r = wa('01092000206', 'أم حسن', 'جوزي اتوفى ومعانا شقة إيجار قديم');
  ids.s6 = r.intake.id;
  if (setNow) setNow(realNow - 2 * 60 * 1000);
  wa('01092000206', 'أم حسن', 'وصاحب البيت عايز يطلّعنا');
  app.ai.cancelTimers(ids.s6);
  // «ملخص مبدئي» محلي فقط (لا يقدّم analyzed_rev): التحليل الكامل بعد اكتمالها
  app.ai.previewIntake(ids.s6);

  return { story6Id: ids.s6, ids };
}
