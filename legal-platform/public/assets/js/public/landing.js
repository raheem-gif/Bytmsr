// الصفحة الرئيسية وصفحات «عن البرنامج» والسياسات (الإصدار 9.1 — B91-07/B91-20؛ v9.2 — P6):
// القائمة ومعاملات الحملة (menu.js) والصفحة المحفوظة (saved.js) فقط — بلا مكتبة المكونات.
// v9.2: مربع «صفحة طلبك» مكان «طلبك فين؟» على موبايلها، زر «بالصوت» (listen.js يُحمَّل عند الحاجة)،
// وتحميل ملفات نموذج الطلب مسبقًا وهي تختار.
// v11 gate-public (GP-4، G11-17 + r2): شاشة الاختيار — «خيري» يكشف المربعات الجاهزة تحتها بلا أي طلب شبكة،
// وزر الرجوع يعيد الشاشة؛ صفحة الأفراد والشركات (#topics) بنفس السلوك عدا «بالصوت».

import { captureAttribution, initSiteChrome } from './menu.js';
import { readSaved, forgetSaved } from './saved.js';

captureAttribution();
initSiteChrome();

const body = document.body;
const start = document.getElementById('start') || document.getElementById('topics');
const gate = document.getElementById('gate');
let L = null; // listen.js بعد التأكد من وجود صوت عربي
let sayHome = null;
if (start) {
  savedTile();
  sayHome = wireListen(
    document.getElementById('start-listen'),
    () => [
      { text: start.dataset.sayIntro, el: document.getElementById('start-title') },
      ...[...start.querySelectorAll('.pub-pick-tile')].map((t) => ({ text: t.dataset.say, el: t })),
      { text: start.dataset.sayOutro, el: start.querySelector('.pub-pick-ways') },
    ],
    start,
    '.pub-pick-tile, .pub-pick-way',
  );
  prefetchForm();
}
if (gate) initGate();

// (r2 S12) الرجوع والتقدم يعرضان الصفحة من ذاكرة bfcache أو من ذاكرة HTTP دون أن يصل الطلب للخادم (فلا Set-Cookie):
// الكعكة تعود لجانب الصفحة المعروضة. فقط في الصفحات التي يكتب الخادم كعكتها (data-seg-sync)، ولا شيء أثناء التحميل المسبق.
const syncSide = () => body.dataset.segSync === '1' && !body.classList.contains('has-gate') && setSide(body.dataset.side);
addEventListener('pageshow', () => document.prerendering || syncSide());
document.addEventListener('prerenderingchange', syncSide);

/** كعكة نوع الخدمة (كلمة واحدة، 180 يومًا) — نفس سمات الخادم */
function setSide(side) {
  if (side !== 'charity' && side !== 'paid') return;
  document.cookie = `bm_seg=${side}; Path=/; Max-Age=15552000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}

// (د) شاشة الاختيار: البطاقتان روابط عادية تعمل بلا JS؛ هنا «خيري» يكشف الصفحة تحتها في الإطار نفسه
function initGate() {
  const site = document.getElementById('site');
  const cards = [...gate.querySelectorAll('.gate-card')];
  const gateTitle = document.title;
  const siteTitle = gate.dataset.titleSite || gateTitle;
  // روابط قديمة مثل /#faq: الرابط يحمل القسم حتى بلا JS
  if (location.hash) for (const a of cards) a.href = `${a.getAttribute('href').split('#')[0]}${location.hash}`;
  wireListen(
    gate.querySelector('.gate-listen'),
    () => [{ text: gate.dataset.sayIntro, el: document.getElementById('gate-title') }, ...cards.map((a) => ({ text: a.dataset.say, el: a }))],
    gate,
    '.gate-card',
  );
  const show = (on) => {
    if (on) body.prepend(gate);
    else gate.remove();
    body.classList.toggle('has-gate', on);
    site?.toggleAttribute('inert', on);
    body.dataset.segSync = on ? '' : '1';
    document.title = on ? gateTitle : siteTitle;
  };
  gate.querySelector('.gate-card--charity')?.addEventListener('click', (e) => {
    if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setSide('charity');
    show(false);
    const q = new URLSearchParams(location.search);
    q.delete('gate');
    const qs = q.toString();
    history.pushState({ gate: false }, '', `/khayri${qs ? `?${qs}` : ''}${location.hash}`);
    const h1 = document.getElementById('start-title');
    h1?.setAttribute('tabindex', '-1');
    h1?.focus({ preventScroll: !!location.hash });
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
    if (sayHome && L?.listenOn()) sayHome();
  });
  // الرجوع إلى «/» يعيد الشاشة بعنوانها، والتقدم يكشف المربعات من جديد — بلا شبكة في الحالتين
  addEventListener('popstate', () => {
    const on = location.pathname === '/';
    if (on === body.classList.contains('has-gate')) return;
    L?.stop();
    show(on);
    (on ? gate.querySelector('.gate-listen:not([hidden])') || cards[0] : document.getElementById('start-title'))?.focus();
  });
}

// (أ) صفحة طلب محفوظة على هذا الموبايل: «صفحة طلبك» في نفس مكان «طلبك فين؟» بلا أي إزاحة، و✕ في ركنه
function savedTile() {
  const li = start.querySelector('[data-follow]');
  const saved = readSaved();
  if (!li || !saved) return;
  const follow = li.innerHTML;
  const pic = li.querySelector('svg')?.cloneNode(true);
  const a = document.createElement('a');
  a.className = 'pub-pick-way pub-pick-way--saved';
  a.href = saved.url;
  const label = document.createElement('b');
  // v11: صفحة الأفراد والشركات تكتب اسم المربع وزر المسح بالجمع (data-saved-label/data-saved-forget)
  label.textContent = start.dataset.savedLabel || 'صفحة طلبك';
  if (pic) a.append(pic);
  a.append(label);
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'pub-saved-forget';
  x.setAttribute('aria-label', start.dataset.savedForget || 'مش موبايلك؟ امسحي');
  x.innerHTML = '<span aria-hidden="true">✕</span>';
  x.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    forgetSaved();
    li.innerHTML = follow;
    li.querySelector('a')?.focus();
  });
  li.replaceChildren(a, x);
}

// (ب) «بالصوت»: يظهر فقط مع صوت عربي على الموبايل. أول ضغطة تقرأ الشاشة (السؤال والمربعات والطرق التانية، أو مقدمة شاشة
// الاختيار وبطاقتيها) وتشغّل السماع في باقي الشاشات (bm.listen)؛ ضغطة وهو بيتكلم توقفه. أي ضغطة على مربع/بطاقة توقف الكلام.
// يعيد say() لقراءة الشاشة نفسها (بعد «خيري» حين كان السماع شغالًا على شاشة الاختيار).
function wireListen(btn, items, scope, stopSel) {
  if (!btn || !('speechSynthesis' in window)) return null;
  let speaking = false;
  const label = btn.querySelector('span');
  const paint = (on) => {
    speaking = on;
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'وقّفوا الصوت' : 'اسمعوا الكلام اللي في الصفحة');
    if (label) label.textContent = on ? 'إيقاف الصوت' : 'بالصوت'; // اسم لا فعل (S-25): «وقّف» أمر لراجل
  };
  const say = () => {
    if (!L) return;
    L.setListen(true);
    paint(true);
    L.speak(items(), {
      onEnd: () => paint(false),
      onFail: (why) => {
        paint(false);
        if (why === 'not-allowed') return;
        // الصوت العربي مذكور لكنه غير محمّل: لا نعرض زرًا لا يعمل
        L.setListen(false);
        btn.hidden = true;
      },
    });
  };
  import('./listen.js')
    .then(async (mod) => {
      if (!(await mod.canListen())) return;
      L = mod;
      btn.hidden = false;
      btn.addEventListener('click', () => {
        if (!speaking) return say();
        L.stop();
        L.setListen(false);
        paint(false);
      });
      scope.addEventListener(
        'pointerdown',
        (e) => {
          if (speaking && e.target.closest(stopSel)) {
            L.stop();
            paint(false);
          }
        },
        true,
      );
    })
    .catch(() => {});
  return say;
}

// (ج) ملفات النموذج تُحمَّل مسبقًا بعد الصفحة (أو مع أول لمسة على مربع) فيفتح أول سؤال فورًا.
// لا شيء مع «توفير البيانات»، ولا على 2G إلا بعد أن تختار فعلًا.
function prefetchForm() {
  const urls = String(start.dataset.prefetch || '').split(/\s+/).filter(Boolean);
  if (!urls.length) return;
  let done = false;
  const run = (chosen) => {
    if (done) return;
    const c = navigator.connection;
    if (c?.saveData) return;
    if (!chosen && /(^|-)2g$/.test(String(c?.effectiveType || ''))) return;
    done = true;
    for (const href of urls) {
      const l = document.createElement('link');
      l.rel = 'prefetch';
      l.href = href;
      l.as = /\.css(\?|$)/.test(href) ? 'style' : 'script';
      document.head.append(l);
    }
  };
  const idle = () => (window.requestIdleCallback ? window.requestIdleCallback(() => run(false), { timeout: 3000 }) : setTimeout(() => run(false), 1500));
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
  start.addEventListener('pointerdown', (e) => e.target.closest('.pub-pick-tile, .g-row') && run(true), { capture: true, once: false });
}
