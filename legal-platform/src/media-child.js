// v12 media (L12-66): عملية فرعية لتنظيف صورة واحدة على الخادم (scan-core بعيدًا عن عملية الويب).
// تُشغَّل بـ child_process.fork من src/services/media.js مع --max-old-space-size=128 وبيئة دنيا وأولوية 19
// وoom_score_adj 1000، وحدة واحدة لكل عملية ثم تُقتل. لا تفعل شيئًا إذا استوردها أحد بالخطأ: تعمل فقط حين
// شغّلها media.js (BM_MEDIA_CHILD=1 وقناة IPC).
//
// البروتوكول: الأب يرسل { id, type: 'clean', input: {...} } ويستقبل { id, ok: true, result } أو { id, ok: false, code, message }.
// MD-0: هيكل فقط؛ خط التنظيف نفسه (فك متتابع بحجم مقترح، detectQuad، البوابة، warp، enhance، ترميز JPEG) في MD-9.

const HANDLERS = {
  // MD-9: clean
};

function reply(msg) {
  try {
    process.send(msg);
  } catch {
    // الأب أغلق القناة
  }
}

if (process.env.BM_MEDIA_CHILD === '1' && typeof process.send === 'function') {
  process.on('message', async (msg) => {
    const id = msg && typeof msg === 'object' ? msg.id : null;
    const fn = msg && HANDLERS[msg.type];
    if (!fn) {
      reply({ id, ok: false, code: 'not_implemented', message: 'unit type not available yet' });
      return;
    }
    try {
      reply({ id, ok: true, result: await fn(msg.input || {}) });
    } catch (e) {
      reply({ id, ok: false, code: e?.code || 'failed', message: String(e?.message || e).slice(0, 300) });
    }
  });
  process.on('disconnect', () => process.exit(0));
  reply({ type: 'ready' });
}
