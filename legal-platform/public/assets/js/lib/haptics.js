// v10 experience (X10-M6) — اهتزاز قصير مع الالتزامات الحقيقية فقط (إرسال، حفظ، موافقة)، في نفس معالج التغيير المرئي.
// لا اهتزاز عند الفتح والإغلاق والتمرير والكتابة. iOS Safari بلا navigator.vibrate: لا شيء ولا خطأ.
const PATTERN = { commit: 12, success: [12, 60, 18], warning: [18, 80, 18], error: [24, 50, 24, 50, 24] };
export function haptic(kind = 'commit') {
  try {
    const n = globalThis.navigator;
    if (typeof n?.vibrate !== 'function') return false;
    if (n.userActivation && !n.userActivation.hasBeenActive) return false; // يتجنب تحذير Chrome «blocked»
    return n.vibrate(PATTERN[kind] || PATTERN.commit);
  } catch {
    return false;
  }
}
