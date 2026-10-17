// v12 tags (TG-1، T12-26…T12-33، L12-43): مُحمِّل «رموز العناصر». لا شيء يُحمَّل للزائر: tags.js يُستورد فقط بعد ?tags=1
// أو ?tags=0 أو مفتاح حسابي أو أمر Ctrl+K أو Alt+Shift+T، أو حين تكون الرموز مشغَّلة في هذا التبويب/الجهاز.
// ?tags=1 يُتذكَّر في sessionStorage وحده (رابط مشارَك لا يُبقي الشارات بعد إغلاق التبويب)، وlocalStorage لا يكتبه إلا
// مفتاح حسابي للفريق (tagsToggle(true, true)). ?tags=0 ينسى الاثنين. ?tag=S-14 يقفز إلى العنصر (والرموز ظاهرة).
// يُزال tags وtag من العنوان (replaceState) بعد قراءتهما، في البحث وفي الوسم (/app#/inbox?tags=1).
// مسار tags.js مبني بالجمع: ليس نصًا حرفيًا يراه site-assets (فلا يدخل في إصدار أي وحدة ولا في التحميل المسبق ولا في
// ذاكرة عامل الخدمة) ولا متغيرًا على window يطغى عليه معرّف عنصر في الصفحة.
// ميزانية: ≤ 450 بايت br كما يُقدَّم (التعليقات الكاملة تُحذف عند التقديم)، فالأسماء قصيرة عمدًا، والكتابة في التخزين
// (تشغيل، إطفاء، تبديل) يتولاها tags.js نفسه: start({ app, set: '1'|'0', focus }) أو start({ toggle: 1, on, device }).
const K = 'bm_tags';
const U = '/assets/js/lib/' + 'tags.js';
let b;
const go = (o) => import(U).then((m) => m.start({ ...b, ...o }), () => {});

// يشغّل الرموز أو يطفئها (on بلا قيمة: يبدّلها). device = مفتاح حسابي على هذا الجهاز (localStorage).
export const tagsToggle = (on, device) => go({ toggle: 1, on, device });

// يُستدعى مرة من menu.js وportal-ui.js وapp/main.js وcompany/main.js ({ app: 1 }: جدول بادئات المنصة والشركات).
// يقرأ العنوان عند التحميل وعند تغيّر الوسم (/app#/inbox?tags=1 في تبويب مفتوح)؛ ?tag=S-14 وحده يُظهر الرموز ويقفز.
export function tagsBoot(o) {
  if (b) return;
  b = { ...o };
  const read = () => {
    const q = location.search + location.hash;
    const g = (r) => r.exec(q)?.[1];
    const v = g(/[?&]tags=([01])/);
    const f = g(/[?&]tag=([^&#]+)/);
    const c = q.replace(/[?&]tags?=[^&#]*/g, '');
    try {
      // يُعاد «?» لأول معامل باقٍ في البحث وفي الوسم
      if (c != q) history.replaceState(history.state, '', location.pathname + c.replace(/(^|#[^?&]*)&/g, '$1?'));
      if (v || f || sessionStorage[K] || localStorage[K]) go({ set: v, focus: f });
    } catch {
      // التخزين غير متاح (وضع خاص): ?tags=1 يعمل للصفحة الحالية فقط
    }
  };
  read();
  addEventListener('hashchange', read);
  // Alt+Shift+T، إلا والتركيز في حقل كتابة (:read-write؛ مربع الاختيار والزر والقائمة لا تمنعه)
  addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.code == 'KeyT' && !e.target.matches?.(':read-write')) tagsToggle();
  });
}
