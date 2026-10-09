// الإصدار 10 — أول ما يُقيَّم من حزمة البوابة (§8.4، CO-12): يطلق meta والجلسة (وبيانات «المتابعة» إن كانت هي الوجهة
// وعلى الجهاز جلسة) قبل تقييم بقية الوحدات، فتصل الردود بينما تُجهَّز الواجهة. api.get يأخذ هذه الردود بالمسار نفسه.
// بلا DOM ولا تخزين يُكتب؛ على الصفحة نفسها فقط (لا JavaScript مضمّن، CSP).
import { prefetchGet } from '../lib/api.js';
import { getItem } from './state.js';

prefetchGet('/company/meta');
prefetchGet('/company/auth/session');
const path = String(window.location.hash || '').replace(/^#/, '').split('?')[0] || '/';
if ((path === '/' || path === '/overview') && getItem('localStorage', 'ek.co.view:signed')) prefetchGet('/company/home');
