// v10 experience (X10-M2) — ورقة سفلية تتبع الإصبع 1:1: مقاومة مطاطية للأعلى، إسقاط الزخم (project) لتقرير الإغلاق،
// تسليم السرعة للنابض، ودخول وخروج من نفس المسار (من أسفل الشاشة). أي حركة جارية (دخول، رجوع، أو خروج لم يُحسم بعد)
// تُمسَك من حيث هي. الحركة المخفّضة: الدخول والخروج تلاشٍ بالشفافية (150ms) بلا انزلاق؛ السحب نفسه يبقى 1:1 لأنه بيد
// المستخدم. لا تبقى خاصية transition على العناصر بعد التلاشي، وdestroy() يزيل كل المستمعين والمؤقتات.
import { spring, SPRING, project, rubberband, reducedMotion } from './spring.js';

// FLICK بكسل/ث: رمية للأسفل تغلق مهما كان الموضع؛ REVERSE: سرعة للأعلى عند الإفلات = تراجع فتبقى الورقة؛
// SLOP بكسل قبل بدء السحب (تمييز اللمسة عن السحب)
const FLICK = 800;
const REVERSE = -150;
const SLOP = 6;
const FADE_MS = 150;
const EXIT = { damping: 1, response: 0.3 };

/**
 * attachSheet({ panel, scrim, handles, canDismiss(reason) → boolean|Promise<boolean>, onDismissed(reason) })
 * → { enter(), exit(reason, { velocity, interruptible }) → Promise<boolean> (true = خرجت، false = أُمسكت فبقيت), destroy() }
 * panel: العنصر المتحرك؛ scrim: الخلفية المعتمة (شفافيتها تتبع الموضع)؛ handles: المقبض والترويسة (touch-action:none في CSS).
 * السحب للأسفل حتى الإغلاق يسأل canDismiss('swipe') ثم يستدعي onDismissed('swipe') بعد خروج الورقة.
 */
export function attachSheet({ panel, scrim, handles = [], canDismiss = () => true, onDismissed = () => {}, onExitCancelled = () => {} }) {
  let y = 0;
  let anim = null;
  let target = 0;
  let drag = null;
  // leaving: { resolve, interruptible, promise } · fading: { timers, resolve }
  let leaving = null;
  let fading = null;
  let alive = true;
  const H = () => panel.getBoundingClientRect().height || 1;
  const els = [panel, scrim].filter(Boolean);
  const paint = (v) => {
    y = v;
    panel.style.transform = v ? `translate3d(0,${v}px,0)` : '';
    if (scrim) scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - v / H())));
  };
  const clearFade = (opacity) => {
    if (!fading) return;
    const f = fading;
    fading = null;
    f.timers.forEach((t) => clearTimeout(t));
    globalThis.cancelAnimationFrame?.(f.raf1);
    globalThis.cancelAnimationFrame?.(f.raf2);
    for (const el of els) {
      el.style.transition = '';
      if (opacity != null) el.style.opacity = String(opacity);
    }
    f.resolve(false);
  };
  const fade = (from, to) =>
    new Promise((res) => {
      clearFade();
      const f = { timers: [], resolve: res, raf1: 0, raf2: 0 };
      fading = f;
      for (const el of els) (el.style.transition = 'none'), (el.style.opacity = String(from));
      f.raf1 = requestAnimationFrame(() => {
        f.raf2 = requestAnimationFrame(() => {
          if (fading !== f) return;
          for (const el of els) (el.style.transition = `opacity ${FADE_MS}ms ease`), (el.style.opacity = String(to));
          f.timers.push(
            setTimeout(() => {
              if (fading !== f) return;
              fading = null;
              for (const el of els) el.style.transition = '';
              res(true);
            }, FADE_MS),
          );
        });
      });
    });
  const go = (to, velocity, cfg, onUpdate = paint) => {
    anim?.stop();
    target = to;
    anim = spring({ from: y, to, velocity, ...cfg, onUpdate });
    return anim.done;
  };

  function enter() {
    if (reducedMotion()) return fade(0, 1);
    paint(H());
    return go(0, 0, SPRING.ui);
  }

  function finish(done) {
    const l = leaving;
    if (!l) return;
    leaving = null;
    if (done) anim?.stop();
    l.resolve(done);
  }

  function exit(reason = 'close', { velocity = 0, interruptible = false } = {}) {
    if (leaving) return leaving.promise;
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    leaving = { resolve, interruptible, promise, reason };
    if (reducedMotion()) {
      // من الشفافية المعروضة الآن (دخول بالتلاشي لم يكتمل) لا من 1
      fade(+(globalThis.getComputedStyle?.(panel).opacity ?? 1), 0).then((ok) => ok && finish(true));
    } else {
      const end = H() + 16;
      // يكفي أن تعبر الورقة حافة الشاشة؛ لا ننتظر سكون النابض
      go(end, velocity, EXIT, (v) => (paint(v), v >= end - 1 && finish(true)));
    }
    return promise;
  }

  const samples = [];
  const velocity = () => {
    const t = performance.now();
    while (samples.length > 2 && t - samples[0][0] > 100) samples.shift();
    // الإصبع توقف قبل الرفع (لا حركة في آخر 100ms): لا زخم
    if (samples.length < 2 || t - samples[samples.length - 1][0] > 100) return 0;
    const [t0, y0] = samples[0];
    const [t1, y1] = samples[samples.length - 1];
    return t1 > t0 ? ((y1 - y0) / (t1 - t0)) * 1000 : 0;
  };
  const isHandle = (t) => handles.some((h) => h && h.contains(t)) && !t.closest?.('button, a, input, select, textarea, [contenteditable]');

  function down(e) {
    if (!alive || e.button > 0) return;
    if (leaving && !leaving.interruptible) return;
    // إمساك الورقة وهي تتحرك: تقف حيث هي على الشاشة (آخر إطار مرسوم = y)، ونكمل من هناك بلا قفزة
    const moving = !!(anim && y !== target);
    if (moving) anim.stop();
    if (leaving) {
      // خروج بالتلاشي (حركة مخفّضة) أُمسك: تعود ظاهرة كاملة
      if (fading) clearFade(1);
      finish(false);
    }
    drag = { id: e.pointerId, y0: y, p0: e.clientY, on: false, handle: isHandle(e.target), caught: moving };
    samples.length = 0;
  }
  function move(e) {
    if (!drag || !drag.handle || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.p0;
    if (!drag.on) {
      if (Math.abs(dy) < SLOP) return;
      drag.on = true;
      try {
        panel.setPointerCapture?.(e.pointerId);
      } catch {
        /* ended */
      }
    }
    const raw = drag.y0 + dy;
    paint(raw >= 0 ? raw : rubberband(raw, H()));
    samples.push([performance.now(), raw]);
  }
  async function up(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.on) {
      // أُمسكت ثم أُفلتت بلا سحب: تكمل لمكانها
      if (d.caught || y) go(0, 0, SPRING.ui);
      return;
    }
    const v = e.type === 'pointercancel' ? 0 : velocity();
    const commit = v >= FLICK || (v > REVERSE && y + project(v) > H() * 0.5);
    if (commit && (await canDismiss('swipe'))) {
      if (!alive) return;
      // gate K7: خروج أُوقف بإمساك الورقة ← تبقى مفتوحة ويُبلَّغ المالك (يعود Esc/✕ للعمل)
      if (await exit('swipe', { velocity: Math.max(v, 0), interruptible: true })) onDismissed('swipe');
      else onExitCancelled('swipe');
      return;
    }
    if (!alive) return;
    // البقاء: ارتداد خفيف فقط إن كانت الإيماءة سريعة (للزخم معنى)
    go(0, v, Math.abs(v) > 300 ? SPRING.sheet : SPRING.ui);
  }

  const LISTEN = [
    ['pointerdown', down],
    ['pointermove', move],
    ['pointerup', up],
    ['pointercancel', up],
  ];
  for (const [type, fn] of LISTEN) panel.addEventListener(type, fn);
  return {
    enter,
    exit,
    destroy() {
      alive = false;
      anim?.stop();
      anim = null;
      clearFade();
      // خروج معلّق لا يبقى وعدًا بلا حسم
      finish(false);
      drag = null;
      for (const [type, fn] of LISTEN) panel.removeEventListener(type, fn);
      for (const el of els) el.style.transition = '';
    },
  };
}
