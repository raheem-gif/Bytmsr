// الصفحة الرئيسية للموقع العام: التقاط مصدر الزيارة، ربط الإعدادات، وأزرار البدء.

import { h } from '../lib/h.js';
import { api } from '../lib/api.js';
import { setMeta } from '../lib/fmt.js';
import { captureAttribution, bindSettings, whatsappUrl, intakeHref, hydrateIcons, setYear } from './common.js';

const WA_GREETING = 'مرحبًا بيوت مصر، أود الحصول على استشارة قانونية.';

async function main() {
  captureAttribution();
  hydrateIcons();

  // روابط البدء تحتفظ بمعاملات الحملة (UTM) حتى تصل إلى صفحة الطلب
  document.querySelectorAll('a[data-cta="intake"]').forEach((a) => (a.href = intakeHref()));
  setYear();

  let meta = null;
  try {
    meta = setMeta(await api.get('/meta'));
  } catch {
    return; // الصفحة تعمل بالمحتوى الثابت
  }
  const s = meta.settings || {};
  bindSettings(s);
  if (s.org_name) document.title = `${s.org_name} — ${s.org_tagline || 'خدمات قانونية'}`;

  const wa = whatsappUrl(s.whatsapp_number_digits, WA_GREETING.replace('بيوت مصر', s.org_name || 'بيوت مصر'));
  document.querySelectorAll('a[data-cta="whatsapp"]').forEach((a) => {
    if (wa) {
      a.href = wa;
      a.hidden = false;
    }
  });

  const waNumber = document.querySelector('[data-slot="wa-number"]');
  if (waNumber && s.whatsapp_display_number) waNumber.hidden = false;

  const areas = meta.constants?.LEGAL_AREAS || [];
  const slot = document.querySelector('[data-slot="areas"]');
  if (slot && areas.length) {
    areas.forEach((a) => slot.append(h('span.chip.chip-primary', a.label)));
    slot.closest('section').hidden = false;
  }
}

main();
