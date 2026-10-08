// الصفحة الرئيسية وصفحات «عن البرنامج» والسياسات (الإصدار 9.1 — B91-07/B91-20؛ v9.2 — P6):
// القائمة ومعاملات الحملة (menu.js) والصفحة المحفوظة (saved.js) فقط — بلا مكتبة المكونات.
// v9.2: مربع «صفحة طلبك» مكان «طلبك فين؟» على موبايلها، زر «بالصوت» (listen.js يُحمَّل عند الحاجة)،
// وتحميل ملفات نموذج الطلب مسبقًا وهي تختار.

import { captureAttribution, initSiteChrome } from './menu.js';
import { readSaved, forgetSaved } from './saved.js';

captureAttribution();
initSiteChrome();

const start = document.getElementById('start');
if (start) {
  savedTile();
  listenButton();
  prefetchForm();
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
  label.textContent = 'صفحة طلبك';
  if (pic) a.append(pic);
  a.append(label);
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'pub-saved-forget';
  x.setAttribute('aria-label', 'مش موبايلك؟ امسحي');
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

// (ب) «بالصوت»: يظهر فقط مع صوت عربي على الموبايل. أول ضغطة تقرأ السؤال والمربعات الثمانية والطرق التانية
// وتشغّل السماع في باقي الشاشات (bm.listen)؛ ضغطة وهو بيتكلم توقفه. أي ضغطة على مربع توقف الكلام.
function listenButton() {
  const btn = document.getElementById('start-listen');
  if (!btn || !('speechSynthesis' in window)) return;
  import('./listen.js')
    .then(async (L) => {
      if (!(await L.canListen())) return;
      const label = btn.querySelector('span');
      const paint = (on) => {
        btn.setAttribute('aria-pressed', String(on));
        btn.setAttribute('aria-label', on ? 'وقّفوا الصوت' : 'اسمعوا الكلام اللي في الصفحة');
        if (label) label.textContent = on ? 'إيقاف الصوت' : 'بالصوت'; // اسم لا فعل (S-25): «وقّف» أمر لراجل
      };
      let speaking = false;
      const done = () => {
        speaking = false;
        paint(false);
      };
      btn.hidden = false;
      btn.addEventListener('click', () => {
        if (speaking) {
          L.stop();
          L.setListen(false);
          done();
          return;
        }
        L.setListen(true);
        speaking = true;
        paint(true);
        const items = [{ text: start.dataset.sayIntro, el: document.getElementById('start-title') }];
        for (const t of start.querySelectorAll('.pub-pick-tile')) items.push({ text: t.dataset.say, el: t });
        items.push({ text: start.dataset.sayOutro, el: start.querySelector('.pub-pick-ways') });
        L.speak(items, {
          onEnd: done,
          onFail: (why) => {
            done();
            if (why === 'not-allowed') return;
            // الصوت العربي مذكور لكنه غير محمّل: لا نعرض زرًا لا يعمل
            L.setListen(false);
            btn.hidden = true;
          },
        });
      });
      start.addEventListener(
        'pointerdown',
        (e) => {
          if (speaking && e.target.closest('.pub-pick-tile, .pub-pick-way')) {
            L.stop();
            done();
          }
        },
        true,
      );
    })
    .catch(() => {});
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
  start.addEventListener('pointerdown', (e) => e.target.closest('.pub-pick-tile') && run(true), { capture: true, once: false });
}
