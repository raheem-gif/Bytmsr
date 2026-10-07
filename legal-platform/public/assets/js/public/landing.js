// الصفحة الرئيسية وصفحات «عن البرنامج» والسياسات (الإصدار 9.1 — B91-07/B91-20):
// القائمة ومعاملات الحملة (menu.js) وبطاقة «عندك طلب عندنا» (saved.js) فقط — بلا مكتبة المكونات.

import { captureAttribution, initSiteChrome } from './menu.js';
import { savedCard } from './saved.js';

captureAttribution();
initSiteChrome();

// الصفحة الرئيسية: صفحة طلب محفوظة على هذا الموبايل ← «افتحي صفحة طلبك» أول ما يُضغط بعد العنوان،
// و«احكيلنا مشكلتك» يصبح زرًا ثانويًا (زر أساسي واحد في الشاشة)، وتختفي بطاقة «قدّمتي طلب قبل كده؟»
const hero = document.querySelector('[data-hero]');
if (hero) {
  const cta = hero.querySelector('[data-hero-cta]');
  const returning = document.querySelector('[data-returning-wrap]');
  const setSecondary = (secondary) => {
    cta?.classList.toggle('pub-btn-gold', !secondary);
    cta?.classList.toggle('pub-btn-outline', secondary);
    if (returning) returning.hidden = secondary;
  };
  const card = savedCard({ onForget: () => setSecondary(false) });
  if (card) {
    (hero.querySelector('.pub-hero-checks') || hero.querySelector('h1')).after(card);
    setSecondary(true);
  }
}
