// v10 experience (X10-M1) — نوابض بأسلوب أبل (damping + response) بلا مكتبات. حل تحليلي (لا تكامل عددي): القيمة
// والسرعة الحاليتان تُحسبان لأي لحظة، فالمقاطعة تبدأ دائمًا من القيمة المعروضة وتحمل سرعتها (لا قفزة ولا «حائط»).
// response = الثواني حتى الوصول تقريبًا (ليست مدة)؛ damping = 1 بلا ارتداد، < 1 ارتداد خفيف (فقط بعد إيماءة لها زخم).
// الحركة المخفّضة (prefers-reduced-motion) تفرض damping = 1 على كل نابض: لا تجاوز للهدف أبدًا.
// onUpdate يكتب transform/opacity فقط. وحدة نقية بلا DOM (تُختبر في Node بمحاكاة performance وrequestAnimationFrame).

export const SPRING = Object.freeze({
  ui: Object.freeze({ damping: 1, response: 0.35 }),
  move: Object.freeze({ damping: 1, response: 0.4 }),
  sheet: Object.freeze({ damping: 0.8, response: 0.3 }),
  press: Object.freeze({ damping: 1, response: 0.15 }),
});

/** المستخدم طلب حركة أقل؟ يُقرأ لحظة الاستدعاء (يتبع تغيير الإعداد في النظام) */
export function reducedMotion() {
  try {
    return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** موضع الإيماءة بعد الزخم (دالة أبل في Designing Fluid Interfaces). v بالبكسل/ثانية */
export const project = (v, d = 0.998) => ((v / 1000) * d) / (1 - d);

/** مقاومة متزايدة بعد الحد (أبل): over بالبكسل، dim بُعد العنصر */
export const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

/** حالة النابض بعد t ثانية: [الإزاحة عن الهدف، السرعة] */
function at(x0, v0, w, z, t) {
  const e = Math.exp(-z * w * t);
  if (z >= 1) {
    const b = v0 + w * x0;
    return [e * (x0 + b * t), e * (v0 - w * b * t)];
  }
  const wd = w * Math.sqrt(1 - z * z);
  const c = Math.cos(wd * t);
  const s = Math.sin(wd * t);
  return [e * (x0 * c + ((v0 + z * w * x0) / wd) * s), e * (v0 * c - ((z * w * v0 + w * w * x0) / wd) * s)];
}

const now = () => globalThis.performance.now();
const raf = (fn) => globalThis.requestAnimationFrame(fn);
const caf = (id) => globalThis.cancelAnimationFrame?.(id);

/**
 * spring({ from, to, velocity, damping, response, onUpdate(value, velocity), onDone(value), rest })
 * → { value(), velocity(), retarget(to, { velocity }), stop(), done: Promise<boolean> }
 * done: true = وصل وسكن، false = أوقفه stop(). retarget بعد السكون يبدأ حركة جديدة بوعد done جديد.
 * retarget يبدأ من القيمة والسرعة المعروضتين الآن. stop يوقف ويعيد القيمة المعروضة، ويحسم الوعد المعلّق دائمًا.
 */
export function spring({ from = 0, to = 0, velocity = 0, damping = 1, response = 0.35, onUpdate, onDone, rest = 0.5 } = {}) {
  const z = reducedMotion() ? 1 : Math.min(1, Math.max(0.05, damping));
  const w = (2 * Math.PI) / Math.max(0.05, response);
  let x0 = from - to;
  let v0 = velocity;
  let target = to;
  let t0 = now();
  let id = 0;
  let live = true;
  // القيمة المعروضة لحظة stop() (وإلا الهدف بعد السكون): منها يبدأ value() وretarget() بلا قفزة
  let held = to;
  let resolve;
  let done;
  const arm = () => (done = new Promise((r) => (resolve = r)));
  arm();
  const state = () => at(x0, v0, w, z, (now() - t0) / 1000);
  const settle = (ok) => {
    const r = resolve;
    resolve = null;
    r?.(ok);
  };
  const finish = () => {
    live = false;
    held = target;
    caf(id);
    onUpdate?.(target, 0);
    onDone?.(target);
    settle(true);
  };
  const frame = () => {
    if (!live) return;
    const [x, v] = state();
    if (Math.abs(x) < rest && Math.abs(v) < rest * 10) return finish();
    onUpdate?.(target + x, v);
    id = raf(frame);
  };
  const api = {
    value: () => (live ? target + state()[0] : held),
    velocity: () => (live ? state()[1] : 0),
    retarget(to2, { velocity: v } = {}) {
      const [x, vv] = live ? state() : [held - target, 0];
      const cur = target + x;
      target = to2;
      x0 = cur - to2;
      v0 = v ?? vv;
      t0 = now();
      if (!live) {
        live = true;
        if (!resolve) arm();
        id = raf(frame);
      }
      return api;
    },
    stop() {
      const val = api.value();
      held = val;
      live = false;
      caf(id);
      settle(false);
      return val;
    },
    get done() {
      return done;
    },
  };
  id = raf(frame);
  return api;
}
