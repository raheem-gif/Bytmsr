// صفحات الموقع العام الثابتة (الرئيسية، عن البرنامج، الخصوصية، الشروط، حذف البيانات).
// المحتوى وإعدادات المؤسسة يولّدها الخادم؛ هنا: التقاط مصدر الزيارة وسلوك القائمة وروابط البدء.

import { captureAttribution, initSiteChrome } from './common.js';

captureAttribution();
initSiteChrome();
