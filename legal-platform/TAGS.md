# رموز العناصر (Element tags registry)

> يولّده `npm run tags` من المصدر، فلا يُعدَّل باليد. الإصدار 12.0.0 · 5423 رمزًا · 99 شاشة.
> الاستعمال: شغّلوا الرموز (`?tags=1`، أو حسابي ← رموز العناصر، أو Ctrl+K «رموز العناصر»، أو Alt+Shift+T)، اضغطوا الشارة لنسخ الرمز، ثم اكتبوا مثلًا «غيّر S-14 …».
> للمهندسين: `npm run tags -- find S-14` يطبع الملف والسطر والنص.

## كيف تطلب تعديلًا بالرمز

1. **شغّل الرموز.** أضف `?tags=1` إلى آخر رابط الصفحة، مثل `/services?tags=1` أو `/app?tags=1#/inbox`. في منصة المكتب يمكنك أيضًا: حسابي ← «رموز العناصر»، أو Ctrl+K ثم «رموز العناصر». تظهر بجانب كل عنصر شارة صغيرة فيها رمزه، مثل `S-14`.
2. **اضغط الشارة.** يُنسخ الرمز وتظهر رسالة «نُسخ الرمز S-14». الشارات لا تغيّر الصفحة ولا يراها الزوار ما لم يفتحوا الرابط نفسه.
3. **أرسل الرمز مع طلبك.** اكتب مثلًا: «S-14: اجعل العنوان أقصر» أو «غيّر INB-12 إلى …». رمز لكل عنصر، ويمكن أن تضم الرسالة أكثر من رمز.

للإطفاء: `?tags=0` في الرابط، أو اضغط «الرموز» في ركن الصفحة ثم «إخفاء الرموز». لفتح صفحة على عنصر بعينه: `?tag=S-14`. القائمة الكاملة أدناه، وفي منصة المكتب على `/app#/tags` مع بحث بالرمز أو بالكلمات.

## الشاشات (Screens)

| البادئة | السطح | الشاشة | الرابط أو مكان الظهور | عدد الرموز |
|---|---|---|---|---|
| L | الموقع | الصفحة الأولى وقالب صفحات الأسئلة | / | 13 |
| T | الموقع | مسار الاختيار: الأسئلة والخيارات | /start | 83 |
| S | الموقع | صفحة المكتب «الخدمات» | /services | 54 |
| H | الموقع | رأس الموقع | يظهر في: أعلى كل صفحات الموقع العام | 12 |
| F | الموقع | تذييل الموقع | يظهر في: أسفل كل صفحات الموقع العام | 32 |
| KH | الموقع | إشعار «خيري» (مؤرشف) | /khayri | 4 |
| PV | الموقع | سياسة الخصوصية | /privacy | 59 |
| TM | الموقع | شروط الاستخدام | /terms | 45 |
| DD | الموقع | حذف البيانات | /data-deletion | 33 |
| NF | الموقع | صفحة غير موجودة أو بلا اتصال | يظهر في: صفحة «غير موجودة» وصفحة انقطاع الاتصال | 9 |
| SU | الموقع | معالج الإعداد الأول | /setup | 44 |
| I | الطلب والمتابعة | نموذج الطلب | /intake | 156 |
| IC | الطلب والمتابعة | طلب عرض لشركة | /intake?mode=company | 30 |
| UP | الطلب والمتابعة | إرفاق المستندات | يظهر في: إرفاق المستندات في نموذج الطلب وصفحة المتابعة وبوابة الشركات | 14 |
| SC | الطلب والمتابعة | تصوير المستندات وتحسينها | يظهر في: شاشة تصوير المستند (الماسح) حيثما يُرفع مستند | 19 |
| P | الطلب والمتابعة | صفحة متابعة الطلب | /p/ | 114 |
| PL | الطلب والمتابعة | دخول صفحة المتابعة | /portal | 28 |
| CC | بوابة الشركات | إطار البوابة: الشريط و«المزيد» والصفحة غير الموجودة | /company#/more | 65 |
| CS | بوابة الشركات | الدخول والروابط: الدعوة وتعيين كلمة المرور والحظر | /company | 48 |
| CW | بوابة الشركات | الترحيب (أول دخول) | /company#/welcome | 35 |
| CH | بوابة الشركات | المتابعة (الرئيسية) | /company#/overview | 20 |
| CR | بوابة الشركات | قائمة الطلبات | /company#/requests | 24 |
| CN | بوابة الشركات | طلب جديد | /company#/requests/new | 42 |
| CK | بوابة الشركات | أنواع الطلبات وحقولها | /company#/requests/new | 134 |
| CQ | بوابة الشركات | صفحة الطلب | /company#/requests/ | 60 |
| CU | بوابة الشركات | مكوّنات البوابة: العرض والتسليم والاستيضاح والوعد والعدّاد | يظهر في: داخل صفحات بوابة الشركات: الطلب والتسليم والاستيضاح | 50 |
| CM | بوابة الشركات | الذاكرة القانونية وقوائمها | /company#/memory | 37 |
| CD | بوابة الشركات | المواعيد المهمة | /company#/memory/calendar | 8 |
| CG | بوابة الشركات | الكيانات | /company#/memory/entities | 14 |
| CX | بوابة الشركات | الأطراف المتعاملة | /company#/memory/counterparties | 4 |
| CI | بوابة الشركات | عنصر في الذاكرة | /company#/memory/item/ | 9 |
| CE | بوابة الشركات | إضافة عنصر في الذاكرة أو تعديله | /company#/memory/ | 3 |
| CT | بوابة الشركات | الفريق | /company#/team | 45 |
| CP | بوابة الشركات | الباقة والاستخدام | /company#/plan | 16 |
| CF | بوابة الشركات | بيانات الشركة | /company#/company | 13 |
| CA | بوابة الشركات | حسابي والأمان | /company#/account | 28 |
| CB | بوابة الشركات | الإشعارات | /company#/notifications | 3 |
| NAV | المنصة | إطار المنصة: القائمة الجانبية والشريط العلوي والجرس وشريط المحامي | /app | 68 |
| LGN | المنصة | الدخول والدعوة واستعادة كلمة المرور والتحقق بخطوتين | /app#/login | 54 |
| KIT | المنصة | مكتبة المكوّنات: الإغلاق والتأكيد وتجاهل التعديلات وإعادة المحاولة واختيار ملف | يظهر في: عناصر مشتركة في كل صفحات المنصة (الإغلاق، التأكيد، إعادة المحاولة، اختيار ملف) | 19 |
| SRC | المنصة | البحث الشامل Ctrl+K | يظهر في: نافذة البحث (Ctrl+K) في المنصة | 8 |
| DSH | المنصة | لوحة المتابعة | /app#/dashboard | 79 |
| INB | المنصة | صندوق الوارد | /app#/inbox | 54 |
| RQT | المنصة | صفحة الطلب الوارد | /app#/inbox/ | 144 |
| PTH | المنصة | نوع الطلب ومساره: الشريحة وسطر المسار والتعديل | /app#/inbox | 18 |
| STY | المنصة | ورقة «اعمله طلب» | /app#/inbox/ | 60 |
| CNT | المنصة | تسجيل المكالمة | يظهر في: نافذة «تسجيل المكالمة» في صفحة الطلب | 12 |
| SPL | المنصة | فصل رسالة إلى طلب جديد | يظهر في: نافذة «اعمل منها طلبًا جديدًا» في المحادثة | 4 |
| SEG | المنصة | نوع الخدمة: الشرائح والمفتاح وورقة التغيير | يظهر في: شرائح نوع الخدمة ونافذة تغييره في الطلبات والملفات | 28 |
| QUE | المنصة | بانتظار قرار الإدارة | /app#/queue | 63 |
| CSL | المنصة | ملفات الاستشارات | /app#/cases | 21 |
| CSF | المنصة | ملف استشارة (كل التبويبات) | /app#/cases/ | 282 |
| PTY | المنصة | الأطراف وتعارض المصالح داخل الملف | يظهر في: تبويب الأطراف في صفحة الملف | 15 |
| MTL | المنصة | الملفات المستمرة | /app#/matters | 14 |
| MTF | المنصة | ملف مستمر | /app#/matters/ | 170 |
| OUT | المنصة | نتيجة الجلسة وإغلاق الملف | يظهر في: نافذة نتيجة الجلسة وإغلاق الملف | 46 |
| CLI | المنصة | المستفيدون | /app#/clients | 25 |
| CLF | المنصة | ملف المستفيد/ة | /app#/clients/ | 90 |
| LWL | المنصة | شبكة المحامين | /app#/lawyers | 66 |
| LWF | المنصة | ملف المحامي | /app#/lawyers/ | 100 |
| ACC | المنصة | المحاسبة | /app#/accounting | 92 |
| AUT | المنصة | الأتمتة والرسائل وصندوق الصادر | /app#/automations | 51 |
| QRP | المنصة | الردود الجاهزة وقوالب واتساب | /app#/quick-replies | 111 |
| KNL | المنصة | المعرفة والذكاء الاصطناعي | /app#/knowledge | 116 |
| KNF | المنصة | مادة معرفية | /app#/knowledge/ | 59 |
| AIR | المنصة | اقتراحات الرد | يظهر في: اقتراحات الرد تحت صندوق الكتابة | 11 |
| DAI | المنصة | تحليل المستند بالذكاء الاصطناعي | يظهر في: تحليل المستند في صفحات الملفات | 15 |
| DOC | المنصة | عارض المستندات: النسخة المحسّنة والأصل والنص | يظهر في: عارض المستندات في الطلب والملف والملف المستمر وطلبات الشركات | 40 |
| VTR | المنصة | تفريغ الرسالة الصوتية والنص الآلي | يظهر في: الرسائل الصوتية في المحادثة وصفحة الطلب | 18 |
| ANL | المنصة | التسويق والتحليلات | /app#/analytics | 87 |
| SIM | المنصة | محاكي واتساب | /app#/simulator | 50 |
| SET | المنصة | الإعدادات والمستخدمون (كل البطاقات) | /app#/settings | 336 |
| INT | المنصة | التكاملات | /app#/integrations | 93 |
| SYS | المنصة | صحة النظام والنسخ الاحتياطي | /app#/system | 85 |
| AUD | المنصة | سجل الأمان | /app#/audit | 32 |
| DAT | المنصة | استيراد وتصدير البيانات | /app#/data | 40 |
| CAL | المنصة | التقويم | /app#/calendar | 48 |
| IMP | المنصة | تقرير الأثر | /app#/impact | 54 |
| CNF | المنصة | فحص تعارض المصالح | /app#/conflicts | 29 |
| PRG | المنصة | البرامج والتمويل | /app#/programs | 131 |
| CRL | المنصة | طلبات الشركات | /app#/company-requests | 33 |
| CRF | المنصة | طلب شركة وأوراقه: القبول والاستيضاح والعرض والتسليم | /app#/company-requests/ | 216 |
| COL | المنصة | قائمة الشركات | /app#/companies | 62 |
| COF | المنصة | ملف شركة | /app#/companies/ | 255 |
| NTF | المنصة | الإشعارات | /app#/notifications | 12 |
| PRF | المنصة | حسابي والأمان | /app#/account | 81 |
| TGS | المنصة | رموز العناصر | /app#/tags | 16 |
| RSH | المنصة | طلب المحامي: معلومة أو مستند أو مساعدة | يظهر في: نافذة طلب المحامي في صفحة الإسناد | 22 |
| DRF | المنصة | المسودات والمقارنة | يظهر في: المسودات في صفحة الإسناد للمحامي | 3 |
| TDY | المنصة | اليوم (المحامي) | /app#/my | 37 |
| ASL | المنصة | إسناداتي | /app#/my/assignments | 11 |
| ASG | المنصة | صفحة الإسناد | /app#/my/assignments/ | 73 |
| WRT | المنصة | وضع الكتابة «رأيي» | /app#/my/assignments/ | 44 |
| LMT | المنصة | ملفاتي المستمرة | /app#/my/matters | 11 |
| LMF | المنصة | ملف مستمر (المحامي) | /app#/my/matters/ | 50 |
| STM | المنصة | مستحقاتي | /app#/my/statement | 18 |
| LCA | المنصة | تقويمي | /app#/my/calendar | 0 (تستعمل رموز CAL (التقويم)) |
| W | الرسائل والمطبوعات | رسائل واتساب | /app#/tags | 54 |
| E | الرسائل والمطبوعات | رسائل البريد الإلكتروني | /app#/tags | 15 |
| D | الرسائل والمطبوعات | المستندات المطبوعة | يظهر في: المستندات المطبوعة من صفحات الملفات | 65 |

## L: الصفحة الأولى وقالب صفحات الأسئلة (`/`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| L-01 | رابط | عن المكتب · الصفحة الأولى | src/site.js:1812 |
| L-02 | رابط | رجوع … | src/site.js:1826 |
| L-03 | نص | اخترتم: … | src/site.js:1827 |
| L-04 | قسم/بطاقة | … | src/site.js:1857 |
| L-05 | رابط | عن المكتب | src/site.js:1846 |
| L-06 | رابط | متابعة طلب | src/site.js:1847 |
| L-07 | رابط | نتصل بكم | src/site.js:1848 |
| L-08 | رابط | واتساب (يفتح في نافذة جديدة) | src/site.js:1850 |
| L-09 | رابط | الخصوصية | src/site.js:1853 |
| L-10 | رابط | الشروط | src/site.js:1853 |
| L-11 | رابط | دخول الشركات | src/site.js:1854 |
| L-12 | قسم/بطاقة | … | src/site.js:1818 |
| L-13 | قائمة روابط | المسار | src/site.js:1826 |

## T: مسار الاختيار: الأسئلة والخيارات (`/start`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| T-01 | سؤال | كيف نساعدكم؟ | public/assets/js/public/entry-tree.js:34 |
| T-02 | خيار | استشارة<br>يظهر النص نفسه أيضًا في: S-12، W-01 (الزر الأول)، I-57 (الخيار الأول)، PTH-01 | public/assets/js/public/entry-tree.js:38 |
| T-03 | سؤال | في أي مجال؟ | public/assets/js/public/entry-tree.js:45 |
| T-04 | خيار | الأسرة والميراث | public/assets/js/public/entry-tree.js:50 |
| T-05 | سؤال | ما الموضوع؟ | public/assets/js/public/entry-tree.js:55 |
| T-06 | خيار | الطلاق أو الخلع | public/assets/js/public/entry-tree.js:57 |
| T-07 | خيار | النفقة | public/assets/js/public/entry-tree.js:58 |
| T-08 | خيار | الحضانة والرؤية | public/assets/js/public/entry-tree.js:59 |
| T-09 | خيار | الميراث | public/assets/js/public/entry-tree.js:60 |
| T-10 | خيار | أموال القاصرين | public/assets/js/public/entry-tree.js:61 |
| T-11 | خيار | موضوع آخر في الأسرة | public/assets/js/public/entry-tree.js:62 |
| T-12 | خيار | العقارات والإيجار | public/assets/js/public/entry-tree.js:67 |
| T-13 | سؤال | ما الموضوع؟ | public/assets/js/public/entry-tree.js:72 |
| T-14 | خيار | إيجار قديم | public/assets/js/public/entry-tree.js:74 |
| T-15 | خيار | إيجار جديد | public/assets/js/public/entry-tree.js:75 |
| T-16 | خيار | بيع أو شراء عقار | public/assets/js/public/entry-tree.js:76 |
| T-17 | خيار | نزاع على ملكية أو وضع يد | public/assets/js/public/entry-tree.js:77 |
| T-18 | خيار | موضوع آخر في العقارات | public/assets/js/public/entry-tree.js:78 |
| T-19 | خيار | العمل والعمال | public/assets/js/public/entry-tree.js:83 |
| T-20 | سؤال | ما الموضوع؟ | public/assets/js/public/entry-tree.js:88 |
| T-21 | خيار | فصل من العمل | public/assets/js/public/entry-tree.js:90 |
| T-22 | خيار | أجور أو مستحقات | public/assets/js/public/entry-tree.js:91 |
| T-23 | خيار | عقد العمل | public/assets/js/public/entry-tree.js:92 |
| T-24 | خيار | موضوع آخر في العمل | public/assets/js/public/entry-tree.js:93 |
| T-25 | خيار | العقود والديون | public/assets/js/public/entry-tree.js:98 |
| T-26 | سؤال | ما الموضوع؟ | public/assets/js/public/entry-tree.js:103 |
| T-27 | خيار | مراجعة عقد قبل التوقيع | public/assets/js/public/entry-tree.js:105 |
| T-28 | خيار | كتابة عقد | public/assets/js/public/entry-tree.js:106 |
| T-29 | خيار | شيكات أو إيصالات أمانة | public/assets/js/public/entry-tree.js:107 |
| T-30 | خيار | دين أو مطالبة مالية | public/assets/js/public/entry-tree.js:108 |
| T-31 | خيار | موضوع آخر في العقود | public/assets/js/public/entry-tree.js:109 |
| T-32 | خيار | المعاش والجهات الحكومية | public/assets/js/public/entry-tree.js:114 |
| T-33 | سؤال | ما الموضوع؟ | public/assets/js/public/entry-tree.js:119 |
| T-34 | خيار | المعاش | public/assets/js/public/entry-tree.js:121 |
| T-35 | خيار | التأمينات الاجتماعية | public/assets/js/public/entry-tree.js:122 |
| T-36 | خيار | مستند رسمي | public/assets/js/public/entry-tree.js:123 |
| T-37 | خيار | قرار حكومي | public/assets/js/public/entry-tree.js:124 |
| T-38 | خيار | جهة حكومية أخرى | public/assets/js/public/entry-tree.js:125 |
| T-39 | خيار | موضوع آخر | public/assets/js/public/entry-tree.js:128 |
| T-40 | خيار | رفع دعوى قضائية<br>يظهر النص نفسه أيضًا في: S-13، W-01 (الزر الثاني)، I-57 (الخيار الثاني)، PTH-01 | public/assets/js/public/entry-tree.js:133 |
| T-41 | سؤال | ما وضع القضية؟ | public/assets/js/public/entry-tree.js:140 |
| T-42 | خيار | رفع دعوى جديدة | public/assets/js/public/entry-tree.js:143 |
| T-43 | خيار | الرد على دعوى مرفوعة | public/assets/js/public/entry-tree.js:144 |
| T-44 | خيار | قضية أمام المحكمة الآن | public/assets/js/public/entry-tree.js:145 |
| T-45 | خيار | صدر حكم | public/assets/js/public/entry-tree.js:146 |
| T-46 | سؤال | ما نوع القضية؟ | public/assets/js/public/entry-tree.js:248 |
| T-47 | خيار | أسرة وميراث | public/assets/js/public/entry-tree.js:250 |
| T-48 | خيار | إيجار وعقارات | public/assets/js/public/entry-tree.js:251 |
| T-49 | خيار | عمل وعمال | public/assets/js/public/entry-tree.js:252 |
| T-50 | خيار | مدني وتجاري | public/assets/js/public/entry-tree.js:253 |
| T-51 | خيار | جنائي | public/assets/js/public/entry-tree.js:254 |
| T-52 | خيار | نوع آخر | public/assets/js/public/entry-tree.js:255 |
| T-53 | خيار | تأسيس شركات<br>يظهر النص نفسه أيضًا في: S-14، W-01 (الزر الثالث)، I-57 (الخيار الثالث)، PTH-01 | public/assets/js/public/entry-tree.js:159 |
| T-54 | سؤال | ما الذي تحتاجونه؟ | public/assets/js/public/entry-tree.js:167 |
| T-55 | خيار | تأسيس شركة جديدة | public/assets/js/public/entry-tree.js:171 |
| T-56 | سؤال | ما الشكل القانوني؟ | public/assets/js/public/entry-tree.js:174 |
| T-57 | خيار | شركة الشخص الواحد | public/assets/js/public/entry-tree.js:177 |
| T-58 | خيار | ذات مسؤولية محدودة | public/assets/js/public/entry-tree.js:178 |
| T-59 | خيار | شركة مساهمة | public/assets/js/public/entry-tree.js:179 |
| T-60 | خيار | تضامن أو توصية بسيطة | public/assets/js/public/entry-tree.js:180 |
| T-61 | خيار | فرع لشركة أجنبية | public/assets/js/public/entry-tree.js:181 |
| T-62 | خيار | لم نحدد بعد | public/assets/js/public/entry-tree.js:182 |
| T-63 | خيار | مستشار قانوني للشركة | public/assets/js/public/entry-tree.js:187 |
| T-64 | سؤال | هل لدى شركتكم حساب معنا؟ | public/assets/js/public/entry-tree.js:193 |
| T-65 | خيار | نعم، الدخول إلى بوابة الشركات | public/assets/js/public/entry-tree.js:196 |
| T-66 | خيار | لا، نريد عرضًا | public/assets/js/public/entry-tree.js:197 |
| T-67 | خيار | تعديل شركة قائمة | public/assets/js/public/entry-tree.js:202 |
| T-68 | سؤال | ما التعديل؟ | public/assets/js/public/entry-tree.js:206 |
| T-69 | خيار | رأس المال | public/assets/js/public/entry-tree.js:209 |
| T-70 | خيار | الشركاء أو المساهمون | public/assets/js/public/entry-tree.js:210 |
| T-71 | خيار | المدير أو النشاط أو المقر | public/assets/js/public/entry-tree.js:211 |
| T-72 | خيار | تغيير الشكل القانوني | public/assets/js/public/entry-tree.js:212 |
| T-73 | خيار | تصفية الشركة | public/assets/js/public/entry-tree.js:213 |
| T-74 | خيار | تعديل آخر | public/assets/js/public/entry-tree.js:214 |
| T-75 | خيار | عقد أو ترخيص أو علامة تجارية | public/assets/js/public/entry-tree.js:219 |
| T-76 | سؤال | ما المطلوب؟ | public/assets/js/public/entry-tree.js:225 |
| T-77 | خيار | عقد | public/assets/js/public/entry-tree.js:228 |
| T-78 | خيار | علامة تجارية | public/assets/js/public/entry-tree.js:229 |
| T-79 | خيار | ترخيص أو سجل تجاري | public/assets/js/public/entry-tree.js:230 |
| T-80 | خيار | موضوع آخر | public/assets/js/public/entry-tree.js:231 |
| T-81 | رابط | تبحثون عن مساعدة قانونية مجانية؟ | public/assets/js/public/entry-tree.js:260 |
| T-82 | خيار | موضوع آخر للشركة | public/assets/js/public/entry-tree.js:236 |
| T-83 | خيار | ورقة من المحكمة أو القسم | public/assets/js/public/entry-tree.js:149 |

## S: صفحة المكتب «الخدمات» (`/services`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| S-10 | عنوان | كيف نساعدكم؟ | public/services.html:23 |
| S-11 | نص | اختاروا ما تحتاجونه. نتفق معكم على الأتعاب كتابةً قبل أن نبدأ. | public/services.html:24 |
| S-12 | عنصر قائمة | استشارة<br>يظهر النص نفسه أيضًا في: T-02، W-01 (الزر الأول)، I-57 (الخيار الأول)، PTH-01 | src/site.js:109 |
| S-13 | عنصر قائمة | رفع دعوى قضائية<br>يظهر النص نفسه أيضًا في: T-40، W-01 (الزر الثاني)، I-57 (الخيار الثاني)، PTH-01 | src/site.js:110 |
| S-14 | عنصر قائمة | تأسيس شركات<br>يظهر النص نفسه أيضًا في: T-53، W-01 (الزر الثالث)، I-57 (الخيار الثالث)، PTH-01 | src/site.js:111 |
| S-15 | نص | … | src/site.js:1232 |
| S-16 | نص | … | public/services.html:29 |
| S-20 | عنوان | كيف نعمل؟ | public/services.html:41 |
| S-21 | عنصر قائمة | تخبروننا بالموضوع | src/site.js:115 |
| S-22 | عنصر قائمة | نتفق على الأتعاب | src/site.js:116 |
| S-23 | عنصر قائمة | نبدأ العمل | src/site.js:117 |
| S-30 | عنوان | مستشار قانوني لشركتكم | src/site.js:1254 |
| S-31 | نص | إدارة قانونية خارجية باشتراك شهري. ترسلون الطلبات من بوابة الشركات، و… | src/site.js:1255 |
| S-32 | قائمة | … | src/site.js:1256 |
| S-33 | نص | الباقة الشهرية حسب حجم الشركة واحتياجها، ونرسل العرض مكتوبًا. | src/site.js:1257 |
| S-34 | رابط | اطلبوا عرضًا | src/site.js:1259 |
| S-35 | رابط | دخول بوابة الشركات | src/site.js:1260 |
| S-36 | رابط | تأسيس شركة جديدة | src/site.js:1262 |
| S-37 | نص | … | src/site.js:1263 |
| S-40 | عنوان | التزامنا معكم | public/services.html:57 |
| S-41 | عنصر قائمة | السرية | src/site.js:121 |
| S-42 | عنصر قائمة | الأتعاب مكتوبة | src/site.js:122 |
| S-43 | عنصر قائمة | محامون مقيدون بالنقابة | src/site.js:123 |
| S-44 | عنصر قائمة | صفحة لكل طلب | src/site.js:124 |
| S-45 | عنوان | الشركاء<br>يُعدَّل من الإعدادات ← الصفحة الأولى ← عن المكتب | src/site.js:1290 |
| S-46 | قائمة | …<br>يُعدَّل من الإعدادات ← الصفحة الأولى ← عن المكتب | src/site.js:1282 |
| S-47 | نص | تأسس المكتب عام … .<br>يُعدَّل من الإعدادات ← الصفحة الأولى ← عن المكتب | src/site.js:1286 |
| S-50 | عنوان | أسئلة شائعة | public/services.html:71 |
| S-51 | عنصر قائمة | كم أتعاب الاستشارة؟ | src/site.js:1167 |
| S-52 | عنصر قائمة | من يطّلع على بياناتي؟ | src/site.js:1172 |
| S-53 | عنصر قائمة | متى يصلني الرد؟ | src/site.js:1178 |
| S-54 | عنصر قائمة | هل تعملون مع الشركات؟ | src/site.js:1184 · src/site.js:1191 |
| S-55 | عنصر قائمة | فقدت رابط صفحة طلبي، ماذا أفعل؟ | src/site.js:1196 |
| S-60 | عنوان | تواصلوا معنا | public/services.html:84 |
| S-61 | عنصر | (نص متغير) | src/site.js:1643 |
| S-62 | قسم/بطاقة | … | src/site.js:1301 |
| S-65 | عنوان | لديكم موضوع قانوني؟ | public/services.html:89 |
| S-66 | نص | اختاروا نوع الخدمة، ثم اكتبوا الموضوع بكلماتكم. لا تحتاجون إلى معرفة… | public/services.html:90 |
| S-67 | رابط | ابدأوا طلبكم | public/services.html:91 |
| S-68 | رابط | نتصل بكم | public/services.html:92 |
| S-69 | رابط | أرسلتم طلبًا من قبل؟ تابعوه من هنا | public/services.html:93 |
| S-70 | قسم/بطاقة | كيف نساعدكم؟ | public/services.html:19 |
| S-71 | قسم/بطاقة | كيف نعمل؟ | public/services.html:37 |
| S-72 | قسم/بطاقة | التزامنا معكم | public/services.html:53 |
| S-73 | قسم/بطاقة | أسئلة شائعة | public/services.html:67 |
| S-74 | قسم/بطاقة | تواصلوا معنا | public/services.html:80 |
| S-75 | قسم/بطاقة | مستشار قانوني لشركتكم | src/site.js:1250 |
| S-76 | قسم/بطاقة | الشركاء | src/site.js:1287 |
| S-77 | رابط | … واتساب (يفتح في نافذة جديدة) | src/site.js:1299 |
| S-78 | رابط | … اتصال | src/site.js:1300 |
| S-79 | عنصر | (نص متغير) | src/site.js:1643 |
| S-80 | عنصر | (نص متغير) | src/site.js:1643 |
| S-81 | عنصر | (نص متغير) | src/site.js:1643 |
| S-82 | عنصر | (نص متغير) | src/site.js:1643 |

## H: رأس الموقع (يظهر في: أعلى كل صفحات الموقع العام)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| H-01 | عنصر | (نص متغير) | src/site.js:878 |
| H-02 | عنصر قائمة | الخدمات | src/site.js:753 |
| H-03 | عنصر قائمة | كيف نعمل | src/site.js:754 |
| H-04 | عنصر قائمة | للشركات | src/site.js:755 |
| H-05 | عنصر قائمة | أسئلة | src/site.js:756 |
| H-06 | رابط | … | src/site.js:872 |
| H-07 | رابط | … | src/site.js:860 |
| H-08 | رابط | واتساب (يفتح في نافذة جديدة) | src/site.js:867 |
| H-09 | زر | … | src/site.js:869 |
| H-10 | رابط | انتقال إلى المحتوى | src/site.js:875 |
| H-11 | قائمة روابط | القائمة الرئيسية | src/site.js:870 |
| H-12 | قسم/بطاقة | … | src/site.js:876 |

## F: تذييل الموقع (يظهر في: أسفل كل صفحات الموقع العام)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| F-01 | رابط | … | src/site.js:1046 |
| F-02 | نص | محاماة واستشارات قانونية للأفراد والشركات… .<br>يُعدَّل من الإعدادات ← الصفحة الأولى ← عن المكتب (المدينة) | src/site.js:1050 |
| F-03 | عنوان | روابط | src/site.js:1054 |
| F-04 | رابط | الصفحة الأولى | src/site.js:1056 |
| F-05 | رابط | عن المكتب | src/site.js:1057 |
| F-06 | رابط | متابعة طلب | src/site.js:1058 |
| F-07 | رابط | للشركات | src/site.js:1059 |
| F-08 | رابط | دخول الشركات | src/site.js:1060 |
| F-09 | عنوان | السياسات | src/site.js:1065 |
| F-10 | رابط | سياسة الخصوصية | src/site.js:1067 |
| F-11 | رابط | شروط الاستخدام | src/site.js:1068 |
| F-12 | رابط | حذف البيانات | src/site.js:1069 |
| F-13 | عنوان | تواصلوا معنا | src/site.js:1073 |
| F-14 | عنصر | (نص متغير) | src/site.js:1074 |
| F-16 | رابط | خيري | src/site.js:1061 |
| F-20 | نص | © … . جميع الحقوق محفوظة.<br>يُعدَّل من الإعدادات ← الصفحة الأولى ← الاسم القانوني للمكتب | src/site.js:1079 |
| F-21 | قسم/بطاقة | روابط | src/site.js:1043 |
| F-22 | عنصر | (نص متغير) | src/site.js:1051 |
| F-23 | عنصر | (نص متغير) | src/site.js:1051 |
| F-24 | قائمة روابط | روابط | src/site.js:1053 |
| F-25 | قائمة روابط | السياسات | src/site.js:1064 |
| F-26 | عنصر | (نص متغير) | src/site.js:1074 |
| F-27 | عنصر | (نص متغير) | src/site.js:1074 |
| F-28 | عنصر | (نص متغير) | src/site.js:1074 |
| F-29 | عنصر | (نص متغير) | src/site.js:1074 |
| F-31 | رابط | دخول فريق العمل والمحامين | src/site.js:1080 |
| F-32 | رابط | دخول الشركات | src/site.js:1080 |
| F-33 | عنصر | (نص متغير) | src/site.js:1681 |
| F-34 | عنصر | (نص متغير) | src/site.js:1681 |
| F-35 | عنصر | (نص متغير) | src/site.js:1681 |
| F-36 | عنصر | (نص متغير) | src/site.js:1681 |
| F-37 | عنصر | (نص متغير) | src/site.js:1681 |

## KH: إشعار «خيري» (مؤرشف) (`/khayri`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| KH-01 | نص | خدمة «خيري» لا تستقبل طلبات جديدة من الموقع حاليًا. | public/khayri-paused.html:21 |
| KH-02 | عنصر | (نص متغير)<br>يُعدَّل من الإعدادات ← التكاملات ← رقم واتساب «خيري» | public/khayri-paused.html:23 |
| KH-03 | رابط | متابعة طلب سابق | public/khayri-paused.html:24 |
| KH-04 | نص | الخصوصية · الشروط | public/khayri-paused.html:25 |

## PV: سياسة الخصوصية (`/privacy`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| PV-01 | نص | تحويل الرسائل الصوتية إلى نص. … ، قد نستعين بخدمة تحويل الكلام إلى نص… | src/services/media.js:1086 |
| PV-02 | نص | تحويل الرسائل الصوتية إلى نص. … ، نحوّل الرسالة الصوتية إلى نص على أج… | src/services/media.js:1090 |
| PV-03 | نص | تحسين صور المستندات وقراءتها. … ، نقصّ حوافها ونعدّل إضاءتها لتصبح وا… | src/services/media.js:1098 |
| PV-04 | نص | وقد نستعين في قراءة النص بأداة الذكاء الاصطناعي Claude من شركة Anthro… | src/services/media.js:1095 |
| PV-05 | قسم/بطاقة | سياسة الخصوصية | public/privacy.html:19 |
| PV-06 | قائمة روابط | مسار التصفح | public/privacy.html:21 |
| PV-07 | رابط | … | public/privacy.html:23 |
| PV-08 | عنوان | سياسة الخصوصية | public/privacy.html:27 |
| PV-09 | عنوان | بالمختصر | public/privacy.html:29 |
| PV-10 | رابط | … | public/privacy.html:35 |
| PV-11 | رابط | … | public/privacy.html:41 |
| PV-12 | سؤال قابل للفتح | محتويات الصفحة | public/privacy.html:52 |
| PV-13 | رابط | من نحن | public/privacy.html:55 |
| PV-14 | رابط | البيانات التي نجمعها | public/privacy.html:56 |
| PV-15 | رابط | لماذا نستخدمها | public/privacy.html:57 |
| PV-16 | رابط | أساس المعالجة | public/privacy.html:58 |
| PV-17 | رابط | من يطّلع على بياناتكم<br>الصيغ: أفراد وشركات «من يطّلع على بياناتكم» · خيري «من يطّلع على بياناتك» | public/privacy.html:59 |
| PV-18 | رابط | التواصل عبر واتساب | public/privacy.html:60 |
| PV-19 | رابط | الذكاء الاصطناعي | public/privacy.html:61 |
| PV-20 | رابط | مدة الاحتفاظ | public/privacy.html:62 |
| PV-21 | رابط | حقوقكم<br>الصيغ: أفراد وشركات «حقوقكم» · خيري «حقوقك» | public/privacy.html:63 |
| PV-22 | رابط | حماية البيانات | public/privacy.html:64 |
| PV-23 | رابط | بيانات الأطفال | public/privacy.html:65 |
| PV-24 | رابط | ملفات تعريف الارتباط | public/privacy.html:66 |
| PV-25 | رابط | تعديل السياسة | public/privacy.html:67 |
| PV-26 | رابط | التواصل معنا | public/privacy.html:68 |
| PV-27 | قسم/بطاقة | 1. من نحن | public/privacy.html:73 |
| PV-28 | عنوان | 1. من نحن | public/privacy.html:74 |
| PV-29 | قسم/بطاقة | 2. البيانات التي نجمعها | public/privacy.html:97 |
| PV-30 | عنوان | 2. البيانات التي نجمعها | public/privacy.html:98 |
| PV-31 | عنوان | بيانات تقدّمونها<br>الصيغ: أفراد وشركات «بيانات تقدّمونها» · خيري «بيانات تقدّمها أنت» | public/privacy.html:99 |
| PV-32 | عنوان | بيانات تصلنا عند التواصل عبر واتساب | public/privacy.html:116 |
| PV-33 | عنوان | بيانات تقنية محدودة | public/privacy.html:126 |
| PV-34 | قسم/بطاقة | 3. لماذا نستخدم بياناتكم<br>الصيغ: أفراد وشركات «3. لماذا نستخدم بياناتكم» · خيري «3. لماذا نستخدم بياناتك» | public/privacy.html:144 |
| PV-35 | عنوان | 3. لماذا نستخدم بياناتكم<br>الصيغ: أفراد وشركات «3. لماذا نستخدم بياناتكم» · خيري «3. لماذا نستخدم بياناتك» | public/privacy.html:145 |
| PV-36 | قسم/بطاقة | 4. أساس المعالجة | public/privacy.html:163 |
| PV-37 | عنوان | 4. أساس المعالجة | public/privacy.html:164 |
| PV-38 | قسم/بطاقة | 5. من يطّلع على بياناتكم<br>الصيغ: أفراد وشركات «5. من يطّلع على بياناتكم» · خيري «5. من يطّلع على بياناتك» | public/privacy.html:174 |
| PV-39 | عنوان | 5. من يطّلع على بياناتكم<br>الصيغ: أفراد وشركات «5. من يطّلع على بياناتكم» · خيري «5. من يطّلع على بياناتك» | public/privacy.html:175 |
| PV-40 | قسم/بطاقة | 6. التواصل عبر واتساب | public/privacy.html:208 |
| PV-41 | عنوان | 6. التواصل عبر واتساب | public/privacy.html:209 |
| PV-42 | رابط | حذف البيانات | public/privacy.html:223 · public/privacy.html:225 |
| PV-43 | قسم/بطاقة | 7. الذكاء الاصطناعي | public/privacy.html:229 |
| PV-44 | عنوان | 7. الذكاء الاصطناعي | public/privacy.html:230 |
| PV-45 | قسم/بطاقة | 8. مدة الاحتفاظ بالبيانات | public/privacy.html:249 |
| PV-46 | عنوان | 8. مدة الاحتفاظ بالبيانات | public/privacy.html:250 |
| PV-47 | قسم/بطاقة | 9. حقوقكم<br>الصيغ: أفراد وشركات «9. حقوقكم» · خيري «9. حقوقك» | public/privacy.html:270 |
| PV-48 | عنوان | 9. حقوقكم<br>الصيغ: أفراد وشركات «9. حقوقكم» · خيري «9. حقوقك» | public/privacy.html:271 |
| PV-49 | رابط | خطوات حذف البيانات | public/privacy.html:276 · public/privacy.html:285 |
| PV-50 | قسم/بطاقة | 10. كيف نحمي بياناتكم<br>الصيغ: أفراد وشركات «10. كيف نحمي بياناتكم» · خيري «10. كيف نحمي بياناتك» | public/privacy.html:292 |
| PV-51 | عنوان | 10. كيف نحمي بياناتكم<br>الصيغ: أفراد وشركات «10. كيف نحمي بياناتكم» · خيري «10. كيف نحمي بياناتك» | public/privacy.html:293 |
| PV-52 | قسم/بطاقة | 11. بيانات الأطفال | public/privacy.html:303 |
| PV-53 | عنوان | 11. بيانات الأطفال | public/privacy.html:304 |
| PV-54 | قسم/بطاقة | 12. ملفات تعريف الارتباط والتخزين في المتصفح | public/privacy.html:314 |
| PV-55 | عنوان | 12. ملفات تعريف الارتباط والتخزين في المتصفح | public/privacy.html:315 |
| PV-56 | قسم/بطاقة | 13. تعديل هذه السياسة | public/privacy.html:328 |
| PV-57 | عنوان | 13. تعديل هذه السياسة | public/privacy.html:329 |
| PV-58 | قسم/بطاقة | 14. التواصل معنا | public/privacy.html:333 |
| PV-59 | عنوان | 14. التواصل معنا | public/privacy.html:334 |

## TM: شروط الاستخدام (`/terms`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| TM-01 | قسم/بطاقة | شروط استخدام الخدمة | public/terms.html:19 |
| TM-02 | قائمة روابط | مسار التصفح | public/terms.html:21 |
| TM-03 | رابط | … | public/terms.html:23 |
| TM-04 | عنوان | شروط استخدام الخدمة | public/terms.html:27 |
| TM-05 | عنوان | بالمختصر | public/terms.html:29 |
| TM-06 | سؤال قابل للفتح | محتويات الصفحة | public/terms.html:50 |
| TM-07 | رابط | القبول بالشروط | public/terms.html:53 |
| TM-08 | رابط | طبيعة الخدمة | public/terms.html:54 |
| TM-09 | رابط | قبول الطلبات<br>الصيغ: أفراد وشركات «قبول الطلبات» · خيري «الاستحقاق وقبول الطلبات» | public/terms.html:55 |
| TM-10 | رابط | الأتعاب والرسوم<br>الصيغ: أفراد وشركات «الأتعاب والرسوم» · خيري «الرسوم والمقابل» | public/terms.html:56 |
| TM-11 | رابط | لا ضمان للنتائج | public/terms.html:57 |
| TM-12 | رابط | العلاقة مع المحامي | public/terms.html:58 |
| TM-13 | رابط | التزاماتكم<br>الصيغ: أفراد وشركات «التزاماتكم» · خيري «التزاماتك» | public/terms.html:59 |
| TM-14 | رابط | المواعيد والحالات العاجلة | public/terms.html:60 |
| TM-15 | رابط | محتوى الموقع | public/terms.html:61 |
| TM-16 | رابط | إيقاف الخدمة | public/terms.html:62 |
| TM-17 | رابط | القانون الواجب التطبيق | public/terms.html:63 |
| TM-18 | رابط | الخدمات بأتعاب للأفراد والشركات | public/terms.html:64 |
| TM-19 | رابط | تعديل الشروط والتواصل | public/terms.html:65 |
| TM-20 | قسم/بطاقة | 1. القبول بالشروط | public/terms.html:70 |
| TM-21 | عنوان | 1. القبول بالشروط | public/terms.html:71 |
| TM-22 | قسم/بطاقة | 2. طبيعة الخدمة | public/terms.html:81 |
| TM-23 | عنوان | 2. طبيعة الخدمة | public/terms.html:82 |
| TM-24 | قسم/بطاقة | 3. قبول الطلبات<br>الصيغ: أفراد وشركات «3. قبول الطلبات» · خيري «3. الاستحقاق وقبول الطلبات» | public/terms.html:99 |
| TM-25 | عنوان | 3. قبول الطلبات<br>الصيغ: أفراد وشركات «3. قبول الطلبات» · خيري «3. الاستحقاق وقبول الطلبات» | public/terms.html:100 |
| TM-26 | قسم/بطاقة | 4. الأتعاب والرسوم<br>الصيغ: أفراد وشركات «4. الأتعاب والرسوم» · خيري «4. الرسوم والمقابل» | public/terms.html:113 |
| TM-27 | عنوان | 4. الأتعاب والرسوم<br>الصيغ: أفراد وشركات «4. الأتعاب والرسوم» · خيري «4. الرسوم والمقابل» | public/terms.html:114 |
| TM-28 | قسم/بطاقة | 5. لا ضمان للنتائج | public/terms.html:138 |
| TM-29 | عنوان | 5. لا ضمان للنتائج | public/terms.html:139 |
| TM-30 | قسم/بطاقة | 6. حدود العلاقة مع المحامي | public/terms.html:149 |
| TM-31 | عنوان | 6. حدود العلاقة مع المحامي | public/terms.html:150 |
| TM-32 | قسم/بطاقة | 7. التزاماتكم<br>الصيغ: أفراد وشركات «7. التزاماتكم» · خيري «7. التزاماتك» | public/terms.html:167 |
| TM-33 | عنوان | 7. التزاماتكم<br>الصيغ: أفراد وشركات «7. التزاماتكم» · خيري «7. التزاماتك» | public/terms.html:168 |
| TM-34 | قسم/بطاقة | 8. المواعيد القانونية والحالات العاجلة | public/terms.html:185 |
| TM-35 | عنوان | 8. المواعيد القانونية والحالات العاجلة | public/terms.html:186 |
| TM-36 | قسم/بطاقة | 9. محتوى الموقع | public/terms.html:208 |
| TM-37 | عنوان | 9. محتوى الموقع | public/terms.html:209 |
| TM-38 | قسم/بطاقة | 10. إيقاف الخدمة | public/terms.html:219 |
| TM-39 | عنوان | 10. إيقاف الخدمة | public/terms.html:220 |
| TM-40 | قسم/بطاقة | 11. القانون الواجب التطبيق | public/terms.html:230 |
| TM-41 | عنوان | 11. القانون الواجب التطبيق | public/terms.html:231 |
| TM-42 | قسم/بطاقة | 12. الخدمات بأتعاب للأفراد والشركات | public/terms.html:236 |
| TM-43 | عنوان | 12. الخدمات بأتعاب للأفراد والشركات | public/terms.html:237 |
| TM-44 | قسم/بطاقة | 13. تعديل الشروط والتواصل | public/terms.html:247 |
| TM-45 | عنوان | 13. تعديل الشروط والتواصل | public/terms.html:248 |

## DD: حذف البيانات (`/data-deletion`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| DD-01 | نص | ويشمل الحذف النسخ المحسّنة من صور مستندات… والنصوص المستخرجة منها ونص… | src/services/media.js:1105 |
| DD-02 | قسم/بطاقة | طلب حذف بياناتكم<br>الصيغ: أفراد وشركات «طلب حذف بياناتكم» · خيري «طلب حذف بياناتك» | public/data-deletion.html:17 |
| DD-03 | قائمة روابط | مسار التصفح | public/data-deletion.html:19 |
| DD-04 | رابط | … | public/data-deletion.html:21 |
| DD-05 | رابط | سياسة الخصوصية | public/data-deletion.html:22 |
| DD-06 | عنوان | طلب حذف بياناتكم<br>الصيغ: أفراد وشركات «طلب حذف بياناتكم» · خيري «طلب حذف بياناتك» | public/data-deletion.html:26 |
| DD-07 | عنوان | بالمختصر | public/data-deletion.html:28 |
| DD-08 | رابط | … | public/data-deletion.html:31 |
| DD-09 | رابط | ابعتيلنا على واتساب | public/data-deletion.html:31 |
| DD-10 | رابط | … | public/data-deletion.html:34 |
| DD-11 | رابط | راسلونا على واتساب | public/data-deletion.html:34 |
| DD-12 | سؤال قابل للفتح | محتويات الصفحة | public/data-deletion.html:50 |
| DD-13 | رابط | كيف تطلبون الحذف<br>الصيغ: أفراد وشركات «كيف تطلبون الحذف» · خيري «كيف تطلب الحذف» | public/data-deletion.html:53 |
| DD-14 | رابط | ما الذي تذكرونه في طلبكم<br>الصيغ: أفراد وشركات «ما الذي تذكرونه في طلبكم» · خيري «ما الذي تذكره في طلبك» | public/data-deletion.html:54 |
| DD-15 | رابط | ماذا يحدث بعد الطلب | public/data-deletion.html:55 |
| DD-16 | رابط | ما الذي يُحذف | public/data-deletion.html:56 |
| DD-17 | رابط | ما قد نحتفظ به | public/data-deletion.html:57 |
| DD-18 | رابط | محادثات واتساب | public/data-deletion.html:58 |
| DD-19 | قسم/بطاقة | 1. كيف تطلبون الحذف<br>الصيغ: أفراد وشركات «1. كيف تطلبون الحذف» · خيري «1. كيف تطلب الحذف» | public/data-deletion.html:63 |
| DD-20 | عنوان | 1. كيف تطلبون الحذف<br>الصيغ: أفراد وشركات «1. كيف تطلبون الحذف» · خيري «1. كيف تطلب الحذف» | public/data-deletion.html:64 |
| DD-21 | رابط | أرسلوا الطلب على واتساب (يفتح في نافذة جديدة)<br>الصيغ: أفراد وشركات «أرسلوا الطلب على واتساب (يفتح في نافذة جديدة)» · خيري «ابعتي الطلب على واتساب (يفتح في نافذة جديدة)» | public/data-deletion.html:73 |
| DD-22 | رابط | … | public/data-deletion.html:82 |
| DD-23 | رابط | … | public/data-deletion.html:91 |
| DD-24 | قسم/بطاقة | 2. ما الذي تذكرونه في طلبكم<br>الصيغ: أفراد وشركات «2. ما الذي تذكرونه في طلبكم» · خيري «2. ما الذي تذكره في طلبك» | public/data-deletion.html:107 |
| DD-25 | عنوان | 2. ما الذي تذكرونه في طلبكم<br>الصيغ: أفراد وشركات «2. ما الذي تذكرونه في طلبكم» · خيري «2. ما الذي تذكره في طلبك» | public/data-deletion.html:108 |
| DD-26 | قسم/بطاقة | 3. ماذا يحدث بعد الطلب | public/data-deletion.html:120 |
| DD-27 | عنوان | 3. ماذا يحدث بعد الطلب | public/data-deletion.html:121 |
| DD-28 | قسم/بطاقة | 4. ما الذي يُحذف | public/data-deletion.html:137 |
| DD-29 | عنوان | 4. ما الذي يُحذف | public/data-deletion.html:138 |
| DD-30 | قسم/بطاقة | 5. ما قد نحتفظ به | public/data-deletion.html:150 |
| DD-31 | عنوان | 5. ما قد نحتفظ به | public/data-deletion.html:151 |
| DD-32 | قسم/بطاقة | 6. محادثات واتساب | public/data-deletion.html:160 |
| DD-33 | عنوان | 6. محادثات واتساب | public/data-deletion.html:161 |

## NF: صفحة غير موجودة أو بلا اتصال (يظهر في: صفحة «غير موجودة» وصفحة انقطاع الاتصال)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| NF-01 | قسم/بطاقة | … | public/404.html:18 |
| NF-02 | قائمة روابط | مسار التصفح | public/404.html:20 |
| NF-03 | رابط | … | public/404.html:22 |
| NF-04 | عنوان | … | public/404.html:27 |
| NF-05 | قسم/بطاقة | … | public/404.html:34 |
| NF-06 | عنوان | … | public/404.html:37 |
| NF-07 | رابط | … | public/404.html:39 |
| NF-08 | رابط | … | public/404.html:40 |
| NF-09 | رابط | … | public/404.html:41 |

## SU: معالج الإعداد الأول (`/setup`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| SU-01 | رابط | تخطَّ إلى المحتوى | public/setup.html:19 |
| SU-02 | قسم/بطاقة | الإعداد الأول للمنصة | public/setup.html:21 |
| SU-03 | زر | السابق | public/assets/js/public/setup.js:125 |
| SU-04 | زر | (نص متغير) | public/assets/js/public/setup.js:126 |
| SU-05 | قسم/بطاقة | (نص متغير) | public/assets/js/public/setup.js:131 |
| SU-06 | عنوان | (نص متغير) | public/assets/js/public/setup.js:131 |
| SU-07 | تنبيه | (نص متغير) | public/assets/js/public/setup.js:167 |
| SU-08 | تنبيه | لم نجد الرمز في الرابط. انسخ رابط الإعداد كاملًا من سجل تشغيل الخادم،… | public/assets/js/public/setup.js:185 |
| SU-09 | زر | توليد رمز تحقق عشوائي | public/assets/js/public/setup.js:328 |
| SU-10 | زر | نسخ | public/assets/js/public/setup.js:345 |
| SU-11 | عنوان | ملف المؤسسة | public/assets/js/public/setup.js:378 |
| SU-12 | عنوان | حساب مدير النظام | public/assets/js/public/setup.js:383 |
| SU-13 | عنوان | التكاملات | public/assets/js/public/setup.js:389 |
| SU-14 | تنبيه | (نص متغير) | public/assets/js/public/setup.js:422 |
| SU-15 | تنبيه | (نص متغير) | public/assets/js/public/setup.js:431 |
| SU-16 | زر | إنهاء الإعداد وإنشاء الحساب | public/assets/js/public/setup.js:436 |
| SU-17 | زر | السابق | public/assets/js/public/setup.js:443 |
| SU-18 | عنوان | تم إعداد المنصة بنجاح | public/assets/js/public/setup.js:456 |
| SU-19 | زر | الدخول إلى المنصة | public/assets/js/public/setup.js:467 |
| SU-20 | عنوان | تم إعداد المنصة بالفعل | public/assets/js/public/setup.js:480 |
| SU-21 | زر | الدخول إلى المنصة | public/assets/js/public/setup.js:482 |
| SU-22 | تنبيه | تعذر تحميل معالج الإعداد | public/assets/js/public/setup.js:495 |
| SU-23 | زر | إعادة المحاولة | public/assets/js/public/setup.js:495 |
| SU-24 | عنوان | إعداد منصة المكتب | public/assets/js/public/setup.js:507 |
| SU-25 | قائمة روابط | خطوات الإعداد | public/assets/js/public/setup.js:510 |
| SU-26 | تنبيه | (نص متغير) | public/assets/js/public/setup.js:530 |
| SU-27 | رسالة | tag | public/assets/js/public/setup.js:31 |
| SU-28 | رسالة | tag | public/assets/js/public/setup.js:32 |
| SU-29 | رسالة | tag | public/assets/js/public/setup.js:33 |
| SU-30 | رسالة | tag | public/assets/js/public/setup.js:34 |
| SU-31 | رسالة | tag | public/assets/js/public/setup.js:35 |
| SU-32 | رسالة | tag | public/assets/js/public/setup.js:36 |
| SU-33 | رسالة | tag | public/assets/js/public/setup.js:37 |
| SU-34 | عنصر قائمة | رمز الإعداد | public/assets/js/public/setup.js:150 |
| SU-35 | نموذج | رمز الإعداد | public/assets/js/public/setup.js:153 |
| SU-36 | نموذج | (نص متغير) | public/assets/js/public/setup.js:211 |
| SU-37 | عنصر قائمة | الاسم الكامل | public/assets/js/public/setup.js:227 |
| SU-38 | عنصر قائمة | اسم المستخدم | public/assets/js/public/setup.js:228 |
| SU-39 | عنصر قائمة | البريد الإلكتروني (اختياري) | public/assets/js/public/setup.js:229 |
| SU-40 | عنصر قائمة | كلمة المرور | public/assets/js/public/setup.js:230 |
| SU-41 | عنصر قائمة | تأكيد كلمة المرور | public/assets/js/public/setup.js:231 |
| SU-42 | نموذج | الاسم الكامل | public/assets/js/public/setup.js:233 |
| SU-43 | نموذج | (نص متغير) | public/assets/js/public/setup.js:305 |
| SU-44 | نموذج | من … . يبدأ بـ … | public/assets/js/public/setup.js:308 |

## I: نموذج الطلب (`/intake`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| I-01 | نص | اخترتم: … | src/site.js:2059 |
| I-02 | نص | … | src/site.js:2063 |
| I-03 | رابط | رجوع … | src/site.js:2058 |
| I-04 | رابط | عن المكتب · الصفحة الأولى | src/site.js:2056 |
| I-11 | سؤال | من المتوفى؟ | public/assets/js/public/entry-tree.js:274 |
| I-12 | سؤال | هل صدر إعلام الوراثة؟ | public/assets/js/public/entry-tree.js:274 |
| I-13 | سؤال | معاش مَن؟ | public/assets/js/public/entry-tree.js:274 |
| I-14 | سؤال | هل يُصرف المعاش الآن؟ | public/assets/js/public/entry-tree.js:274 |
| I-15 | سؤال | أين أموال القاصرين؟ | public/assets/js/public/entry-tree.js:275 |
| I-16 | سؤال | النفقة: ما الوضع الآن؟ | public/assets/js/public/entry-tree.js:275 |
| I-17 | سؤال | ما المشكلة؟ | public/assets/js/public/entry-tree.js:275 |
| I-18 | سؤال | كم عدد الأبناء أقل من 18 سنة؟ | public/assets/js/public/entry-tree.js:275 |
| I-19 | سؤال | هل السكن إيجار أم ملك؟ | public/assets/js/public/entry-tree.js:275 |
| I-20 | سؤال | هل هناك مطالبة بإخلاء السكن؟ | public/assets/js/public/entry-tree.js:276 |
| I-21 | سؤال | ما المستند المطلوب؟ | public/assets/js/public/entry-tree.js:276 |
| I-22 | سؤال | هل هناك جلسة أو موعد قريب؟ | public/assets/js/public/entry-tree.js:276 |
| I-23 | سؤال | متى صدر الحكم؟ | public/assets/js/public/entry-tree.js:277 |
| I-24 | سؤال | النفقة لمن؟ | public/assets/js/public/entry-tree.js:277 |
| I-25 | سؤال | أنتم المالك أم المستأجر؟ | public/assets/js/public/entry-tree.js:277 |
| I-30 | عنصر | اكتبوا الموضوع باختصار | public/assets/js/public/intake.js:1050 |
| I-31 | حقل | اكتبوا هنا ما حدث، وما الذي تحتاجونه… | public/assets/js/public/intake.js:1074 |
| I-32 | زر | (نص متغير) | public/assets/js/public/intake.js:1122 |
| I-33 | زر | تفضّلون أن نتصل بكم؟ | public/assets/js/public/intake.js:1167 |
| I-34 | زر | (نص متغير) | public/assets/js/public/intake.js:1110 |
| I-40 | عنصر | هل لديكم مستندات؟ | public/assets/js/public/intake.js:953 |
| I-41 | زر | التالي | public/assets/js/public/intake.js:956 |
| I-42 | نص | (نص متغير) | public/assets/js/public/intake.js:955 |
| I-43 | زر | ليس الآن | public/assets/js/public/intake.js:957 |
| I-50 | عنصر | (نص متغير) | public/assets/js/public/intake.js:1307 |
| I-51 | حقل | رقم الموبايل | public/assets/js/public/intake.js:1321 |
| I-52 | حقل | الاسم كما تحبون أن نناديكم | public/assets/js/public/intake.js:1464 |
| I-53 | حقل | (نص متغير) | public/assets/js/public/intake.js:1456 |
| I-54 | نص | اعرفوا المزيد | public/assets/js/public/intake.js:1475 |
| I-55 | زر | طلب مكالمة | public/assets/js/public/intake.js:1476 |
| I-56 | حقل | متى يناسبكم الاتصال؟ | public/assets/js/public/intake.js:1419 |
| I-57 | حقل | نوع الطلب (اختياري)<br>يظهر النص نفسه أيضًا في: T-02، S-12، W-01 (الزر الأول)، PTH-01، T-40، S-13، T-53، S-14 | public/assets/js/public/intake.js:1450 |
| I-58 | حقل | رقم من خارج مصر؟ | public/assets/js/public/intake.js:1326 |
| I-60 | عنوان | وصلنا طلبكم | public/assets/js/public/intake.js:1734 |
| I-61 | نص | رقم الطلب: | public/assets/js/public/intake.js:1748 |
| I-62 | نص | سنتصل بكم {eta}{when} | public/assets/js/public/intake.js:1739 |
| I-63 | رابط | فتح صفحة طلبكم | public/assets/js/public/intake.js:1752 |
| I-64 | قسم/بطاقة | المتابعة على واتساب | public/assets/js/public/intake.js:1753 |
| I-65 | نص | لا نطلب أي مبلغ إلا من صفحة طلبكم وبعد موافقتكم. | public/assets/js/public/intake.js:1754 |
| I-66 | نص | الصفحة الأولى | public/assets/js/public/intake.js:1757 |
| I-67 | نص | قد يكون في موضوعكم ميعاد قريب، لذلك سنتصل بكم في أقرب وقت خلال مواعيد… | public/assets/js/public/intake.js:1736 |
| I-68 | رابط | أو اتصلوا بنا الآن: | public/assets/js/public/intake.js:1750 |
| I-80 | خيار | الزوج أو الزوجة | public/assets/js/public/entry-tree.js:355 |
| I-81 | خيار | أحد الوالدين | public/assets/js/public/entry-tree.js:355 |
| I-82 | خيار | ابن أو ابنة | public/assets/js/public/entry-tree.js:355 |
| I-83 | خيار | شخص آخر | public/assets/js/public/entry-tree.js:356 |
| I-84 | خيار | لا أعرف | public/assets/js/public/entry-tree.js:356 |
| I-85 | خيار | نعم، صدر | public/assets/js/public/entry-tree.js:356 |
| I-86 | خيار | ليس بعد | public/assets/js/public/entry-tree.js:357 |
| I-87 | خيار | لا أعرف | public/assets/js/public/entry-tree.js:357 |
| I-88 | خيار | معاش الزوج أو الزوجة | public/assets/js/public/entry-tree.js:357 |
| I-89 | خيار | معاش أحد الوالدين | public/assets/js/public/entry-tree.js:358 |
| I-90 | خيار | تكافل وكرامة | public/assets/js/public/entry-tree.js:358 |
| I-91 | خيار | معاشي أو غير ذلك | public/assets/js/public/entry-tree.js:358 |
| I-92 | خيار | لا أعرف | public/assets/js/public/entry-tree.js:358 |
| I-93 | خيار | لم يُصرف بعد | public/assets/js/public/entry-tree.js:359 |
| I-94 | خيار | كان يُصرف وتوقف | public/assets/js/public/entry-tree.js:359 |
| I-95 | خيار | يُصرف بقيمة أقل | public/assets/js/public/entry-tree.js:359 |
| I-96 | خيار | لا أعرف | public/assets/js/public/entry-tree.js:359 |
| I-97 | خيار | في البنك | public/assets/js/public/entry-tree.js:360 |
| I-98 | خيار | في البريد | public/assets/js/public/entry-tree.js:360 |
| I-99 | خيار | تركة لم تُقسم | public/assets/js/public/entry-tree.js:360 |
| I-100 | خيار | أخرى | public/assets/js/public/entry-tree.js:361 |
| I-101 | خيار | لا أعرف | public/assets/js/public/entry-tree.js:361 |
| I-102 | خيار | الأب متوفى | public/assets/js/public/entry-tree.js:361 |
| I-103 | خيار | الوالدان منفصلان | public/assets/js/public/entry-tree.js:362 |
| I-104 | خيار | الأب لا ينفق | public/assets/js/public/entry-tree.js:362 |
| I-105 | خيار | غير ذلك | public/assets/js/public/entry-tree.js:362 |
| I-106 | خيار | لا أعرف | public/assets/js/public/entry-tree.js:363 |
| I-107 | خيار | نزاع على الحضانة | public/assets/js/public/entry-tree.js:363 |
| I-108 | خيار | لا أرى أبنائي | public/assets/js/public/entry-tree.js:363 |
| I-109 | خيار | مشكلة في مواعيد الرؤية | public/assets/js/public/entry-tree.js:364 |
| I-110 | خيار | أخرى | public/assets/js/public/entry-tree.js:364 |
| I-111 | خيار | لا أعرف | public/assets/js/public/entry-tree.js:364 |
| I-112 | خيار | لا يوجد | public/assets/js/public/entry-tree.js:365 |
| I-113 | خيار | 1 | public/assets/js/public/entry-tree.js:365 |
| I-114 | خيار | 2 | public/assets/js/public/entry-tree.js:365 |
| I-115 | خيار | 3 | public/assets/js/public/entry-tree.js:365 |
| I-116 | خيار | 4 أو أكثر | public/assets/js/public/entry-tree.js:365 |
| I-117 | خيار | لا أعرف | public/assets/js/public/entry-tree.js:366 |
| I-118 | خيار | إيجار قديم | public/assets/js/public/entry-tree.js:366 |
| I-119 | خيار | إيجار جديد | public/assets/js/public/entry-tree.js:366 |
| I-120 | خيار | ملك | public/assets/js/public/entry-tree.js:367 |
| I-121 | خيار | لدى الأسرة | public/assets/js/public/entry-tree.js:367 |
| I-122 | خيار | لا أعرف | public/assets/js/public/entry-tree.js:367 |
| I-123 | خيار | نعم | public/assets/js/public/entry-tree.js:367 |
| I-124 | خيار | لا | public/assets/js/public/entry-tree.js:368 |
| I-125 | خيار | لا أعرف | public/assets/js/public/entry-tree.js:368 |
| I-126 | خيار | شهادة وفاة | public/assets/js/public/entry-tree.js:368 |
| I-127 | خيار | قيد عائلي | public/assets/js/public/entry-tree.js:368 |
| I-128 | خيار | بطاقة أو شهادة ميلاد | public/assets/js/public/entry-tree.js:369 |
| I-129 | خيار | مستند آخر | public/assets/js/public/entry-tree.js:369 |
| I-130 | خيار | لا أعرف | public/assets/js/public/entry-tree.js:369 |
| I-131 | خيار | خلال أسبوعين | public/assets/js/public/entry-tree.js:369 |
| I-132 | خيار | بعد أكثر من أسبوعين | public/assets/js/public/entry-tree.js:370 |
| I-133 | خيار | لا يوجد موعد بعد | public/assets/js/public/entry-tree.js:370 |
| I-134 | خيار | لا أعرف | public/assets/js/public/entry-tree.js:370 |
| I-135 | خيار | خلال آخر أسبوعين | public/assets/js/public/entry-tree.js:370 |
| I-136 | خيار | من أسبوعين إلى 40 يومًا | public/assets/js/public/entry-tree.js:371 |
| I-137 | خيار | منذ أكثر من 40 يومًا | public/assets/js/public/entry-tree.js:371 |
| I-138 | خيار | لا أعرف | public/assets/js/public/entry-tree.js:371 |
| I-139 | خيار | للزوجة | public/assets/js/public/entry-tree.js:372 |
| I-140 | خيار | للأبناء | public/assets/js/public/entry-tree.js:372 |
| I-141 | خيار | للزوجة والأبناء | public/assets/js/public/entry-tree.js:372 |
| I-142 | خيار | مطلوب منّا دفعها | public/assets/js/public/entry-tree.js:373 |
| I-143 | خيار | لا أعرف | public/assets/js/public/entry-tree.js:373 |
| I-144 | خيار | المالك | public/assets/js/public/entry-tree.js:373 |
| I-145 | خيار | المستأجر | public/assets/js/public/entry-tree.js:374 |
| I-146 | خيار | لا أعرف | public/assets/js/public/entry-tree.js:374 |
| I-150 | زر | (نص متغير) | public/assets/js/public/intake.js:637 |
| I-151 | زر | (نص متغير) | public/assets/js/public/intake.js:735 |
| I-152 | قسم/بطاقة | (نص متغير) | public/assets/js/public/intake.js:945 |
| I-153 | قسم/بطاقة | (نص متغير) | public/assets/js/public/intake.js:973 |
| I-154 | زر | حذفها | public/assets/js/public/intake.js:1083 |
| I-155 | زر | (نص متغير) | public/assets/js/public/intake.js:1099 |
| I-156 | زر | (نص متغير) | public/assets/js/public/intake.js:1133 |
| I-157 | زر | (نص متغير) | public/assets/js/public/intake.js:1155 |
| I-158 | رابط | (نص متغير) | public/assets/js/public/intake.js:1186 |
| I-159 | قسم/بطاقة | (نص متغير) | public/assets/js/public/intake.js:1246 |
| I-160 | زر | تعديل الموضوع | public/assets/js/public/intake.js:1305 |
| I-161 | زر | الاستماع إلى الرقم | public/assets/js/public/intake.js:1337 |
| I-162 | رابط | فتح واتساب | public/assets/js/public/intake.js:1378 |
| I-163 | زر | لا تذكرون الرقم؟ | public/assets/js/public/intake.js:1389 |
| I-164 | زر | (نص متغير) | public/assets/js/public/intake.js:1412 |
| I-165 | زر | (نص متغير) | public/assets/js/public/intake.js:1444 |
| I-166 | حقل | اسم الشركة (اختياري) | public/assets/js/public/intake.js:1457 |
| I-167 | حقل | الاسم (اختياري) | public/assets/js/public/intake.js:1465 |
| I-168 | زر | إعادة المحاولة | public/assets/js/public/intake.js:1613 |
| I-169 | زر | العودة إلى الموضوع | public/assets/js/public/intake.js:1617 |
| I-170 | قسم/بطاقة | (نص متغير) | public/assets/js/public/intake.js:1639 |
| I-171 | زر | إرسال | public/assets/js/public/intake.js:1680 |
| I-172 | رابط | (نص متغير) | public/assets/js/public/intake.js:1702 |
| I-173 | قسم/بطاقة | رقم الطلب: | public/assets/js/public/intake.js:1746 |
| I-174 | عنوان | المتابعة على واتساب | public/assets/js/public/intake.js:1753 |
| I-175 | رابط | إرسال على واتساب | public/assets/js/public/intake.js:1753 |
| I-176 | عنوان | وصلنا رسالتكم. شكرًا لكم. | public/assets/js/public/intake.js:1794 |
| I-177 | قسم/بطاقة | (نص متغير) | public/assets/js/public/intake.js:1795 |
| I-178 | رابط | (نص متغير) | public/assets/js/public/intake.js:1795 |
| I-179 | قسم/بطاقة | الموقع قيد التجهيز | public/assets/js/public/intake.js:2211 |
| I-180 | عنوان | الموقع قيد التجهيز | public/assets/js/public/intake.js:2212 |
| I-181 | رابط | تواصلوا معنا على واتساب | public/assets/js/public/intake.js:2214 |
| I-182 | رابط | اتصلوا بنا: | public/assets/js/public/intake.js:2215 |
| I-183 | قسم/بطاقة | تعذّر فتح الصفحة | public/assets/js/public/intake.js:2225 |
| I-184 | عنوان | تعذّر فتح الصفحة | public/assets/js/public/intake.js:2226 |
| I-185 | زر | إعادة المحاولة | public/assets/js/public/intake.js:2228 |
| I-186 | قسم/بطاقة | بدأتم طلبًا من قبل. | public/assets/js/public/intake.js:2300 |
| I-187 | زر | متابعة الطلب | public/assets/js/public/intake.js:2305 |
| I-188 | زر | البدء من جديد | public/assets/js/public/intake.js:2321 |
| I-189 | رابط | … } واتساب | public/intake.html:30 |
| I-190 | رابط | … } … | public/intake.html:31 |
| I-191 | عنوان | … | public/intake.html:40 |
| I-196 | قائمة روابط | المسار | src/site.js:2058 |

## IC: طلب عرض لشركة (`/intake?mode=company`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| IC-01 | عنوان | اطلبوا عرضًا لشركتكم | public/assets/js/public/intake-company.js:124 |
| IC-02 | نص | املأوا البيانات، ويتواصل معكم فريقنا خلال يوم عمل لترتيب مكالمة تعريف… | public/assets/js/public/intake-company.js:242 |
| IC-03 | حقل | اسم الشركة | public/assets/js/public/intake-company.js:111 |
| IC-04 | حقل | اسم المسؤول عن التواصل | public/assets/js/public/intake-company.js:112 |
| IC-05 | حقل | المسمى الوظيفي (اختياري) | public/assets/js/public/intake-company.js:113 |
| IC-06 | حقل | رقم الموبايل | public/assets/js/public/intake-company.js:116 |
| IC-07 | حقل | البريد الإلكتروني (اختياري) | public/assets/js/public/intake-company.js:117 |
| IC-08 | مجموعة حقول | عدد الموظفين (اختياري) | public/assets/js/public/intake-company.js:248 |
| IC-09 | مجموعة حقول | ما الذي يهمكم؟ (اختياري) | public/assets/js/public/intake-company.js:249 |
| IC-10 | قسم/بطاقة | تفاصيل إضافية (اختياري) | public/assets/js/public/intake-company.js:250 |
| IC-11 | نص | بالضغط على «إرسال الطلب» توافقون على استخدام هذه البيانات للتواصل معك… | public/assets/js/public/intake-company.js:251 |
| IC-12 | زر | إرسال الطلب | public/assets/js/public/intake-company.js:123 |
| IC-13 | عنوان | وصلنا طلبكم | public/assets/js/public/intake-company.js:208 |
| IC-14 | نص | سيتواصل معكم فريقنا خلال يوم عمل. | public/assets/js/public/intake-company.js:223 |
| IC-15 | نص | لديكم حساب في بوابة الشركات؟ | public/assets/js/public/intake-company.js:225 |
| IC-16 | نص | رقم من خارج مصر؟ | public/assets/js/public/intake-company.js:115 |
| IC-17 | خيار | (نص متغير) | public/assets/js/public/intake-company.js:119 |
| IC-18 | حقل | اسم الشركة | public/assets/js/public/intake-company.js:111 |
| IC-19 | رابط | راسلونا على واتساب | public/assets/js/public/intake-company.js:115 |
| IC-20 | حقل | مثال: نحتاج مراجعة عقود الموردين وشؤون الموظفين، ولدينا 40 موظفًا. | public/assets/js/public/intake-company.js:121 |
| IC-21 | قسم/بطاقة | سيتواصل معكم فريقنا خلال يوم عمل. | public/assets/js/public/intake-company.js:220 |
| IC-22 | رابط | الدخول | public/assets/js/public/intake-company.js:225 |
| IC-23 | رابط | صفحة الطلب | public/assets/js/public/intake-company.js:226 |
| IC-24 | قسم/بطاقة | رجوع | public/assets/js/public/intake-company.js:237 |
| IC-25 | رابط | رجوع | public/assets/js/public/intake-company.js:240 |
| IC-26 | حقل | اسم المسؤول عن التواصل | public/assets/js/public/intake-company.js:112 |
| IC-27 | حقل | المسمى الوظيفي (اختياري) | public/assets/js/public/intake-company.js:113 |
| IC-28 | حقل | رقم الموبايل | public/assets/js/public/intake-company.js:116 |
| IC-29 | حقل | البريد الإلكتروني (اختياري) | public/assets/js/public/intake-company.js:117 |
| IC-30 | خيار | (نص متغير) | public/assets/js/public/intake-company.js:120 |

## UP: إرفاق المستندات (يظهر في: إرفاق المستندات في نموذج الطلب وصفحة المتابعة وبوابة الشركات)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| UP-01 | زر | (نص متغير) | public/assets/js/public/upload.js:634 |
| UP-02 | زر | (نص متغير) | public/assets/js/public/upload.js:651 |
| UP-03 | قائمة | الصور المختارة | public/assets/js/public/upload.js:658 |
| UP-04 | زر | (نص متغير) | public/assets/js/public/upload.js:759 |
| UP-05 | زر | (نص متغير) | public/assets/js/public/upload.js:778 |
| UP-06 | نص | (نص متغير) | public/assets/js/public/upload.js:656 |
| UP-07 | قسم/بطاقة | (نص متغير) | public/assets/js/public/upload.js:672 |
| UP-08 | نص | (نص متغير) | public/assets/js/public/upload.js:657 |
| UP-09 | قسم/بطاقة | (نص متغير) | public/assets/js/public/upload.js:548 |
| UP-10 | زر | تعديل | public/assets/js/public/upload.js:219 |
| UP-11 | زر | (نص متغير) | public/assets/js/public/upload.js:552 |
| UP-12 | حقل | (نص متغير) | public/assets/js/public/upload.js:610 |
| UP-13 | حقل | (نص متغير) | public/assets/js/public/upload.js:611 |
| UP-14 | زر | (نص متغير) | public/assets/js/public/upload.js:687 |

## SC: تصوير المستندات وتحسينها (يظهر في: شاشة تصوير المستند (الماسح) حيثما يُرفع مستند)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| SC-01 | قسم/بطاقة | إغلاق | public/assets/js/lib/scan-sheet.js:174 |
| SC-02 | نص | (نص متغير) | public/assets/js/lib/scan-sheet.js:177 |
| SC-03 | زر | إغلاق | public/assets/js/lib/scan-sheet.js:178 |
| SC-04 | زر | (نص متغير) | public/assets/js/lib/scan-sheet.js:161 |
| SC-05 | صورة | الورقة بعد التحسين | public/assets/js/lib/scan-sheet.js:165 |
| SC-06 | قسم/بطاقة | الألوان | public/assets/js/lib/scan-sheet.js:182 |
| SC-07 | عنصر قائمة | ألوان | public/assets/js/lib/scan-sheet.js:74 |
| SC-08 | عنصر قائمة | رمادي | public/assets/js/lib/scan-sheet.js:75 |
| SC-09 | عنصر قائمة | أبيض وأسود | public/assets/js/lib/scan-sheet.js:76 |
| SC-10 | زر | (نص متغير) | public/assets/js/lib/scan-sheet.js:186 |
| SC-11 | زر | (نص متغير) | public/assets/js/lib/scan-sheet.js:191 |
| SC-12 | زر | (نص متغير) | public/assets/js/lib/scan-sheet.js:171 |
| SC-13 | زر | (نص متغير) | public/assets/js/lib/scan-sheet.js:187 |
| SC-14 | قسم/بطاقة | (نص متغير) | public/assets/js/lib/scan-sheet.js:99 |
| SC-15 | زر | (نص متغير) | public/assets/js/lib/scan-sheet.js:103 |
| SC-16 | زر | (نص متغير) | public/assets/js/lib/scan-sheet.js:104 |
| SC-17 | زر | صفحة أخرى | public/assets/js/lib/scan-sheet.js:112 |
| SC-18 | نص | (نص متغير) | public/assets/js/lib/scan-sheet.js:118 |
| SC-21 | نص | (نص متغير) | public/assets/js/lib/scan-sheet.js:113 |

## P: صفحة متابعة الطلب (`/p/`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| P-01 | نص | أو أرسلوا رسالة صوتية على واتساب | public/assets/js/public/portal.js:570 |
| P-02 | نص | لديكم رسالة صوتية محفوظة من قبل، وستُرسل مع ردّكم. | public/assets/js/public/portal.js:560 |
| P-03 | زر | حذفها | public/assets/js/public/portal.js:563 |
| P-10 | زر | إغلاق | public/assets/js/public/portal-ui.js:192 |
| P-11 | زر | … بينا | public/assets/js/public/portal.js:222 |
| P-12 | زر | رجوع | public/assets/js/public/portal.js:261 |
| P-13 | عنوان | (نص متغير) | public/assets/js/public/portal.js:262 |
| P-14 | قسم/بطاقة | مطلوب منكم<br>الصيغ: أفراد وشركات «مطلوب منكم» · خيري «مطلوب منك» | public/assets/js/public/portal.js:312 |
| P-15 | عنوان | نحتاج منكم:<br>الصيغ: أفراد وشركات «نحتاج منكم:» · خيري «محتاجين منك:» | public/assets/js/public/portal.js:314 |
| P-16 | زر | تصوير المستند<br>الصيغ: أفراد وشركات «تصوير المستند» · خيري «صوّر{ي} الورقة» | public/assets/js/public/portal.js:320 |
| P-17 | زر | أو اختيار صورة من الهاتف<br>الصيغ: أفراد وشركات «أو اختيار صورة من الهاتف» · خيري «أو اختار{ي} صورة من الموبايل» | public/assets/js/public/portal.js:321 |
| P-18 | زر | الرد علينا<br>الصيغ: أفراد وشركات «الرد علينا» · خيري «ردّ{ي} علينا» | public/assets/js/public/portal.js:325 |
| P-19 | قسم/بطاقة | مطلوب حضوركم بأنفسكم<br>الصيغ: أفراد وشركات «مطلوب حضوركم بأنفسكم» · خيري «لازم تحضر{ي} بنفسك» | public/assets/js/public/portal.js:332 |
| P-20 | عنوان | (نص متغير) | public/assets/js/public/portal.js:334 |
| P-21 | زر | ما المطلوب منكم؟<br>الصيغ: أفراد وشركات «ما المطلوب منكم؟» · خيري «إيه المطلوب مني؟» | public/assets/js/public/portal.js:336 |
| P-22 | قسم/بطاقة | مطلوب منكم<br>الصيغ: أفراد وشركات «مطلوب منكم» · خيري «مطلوب منك» | public/assets/js/public/portal.js:342 |
| P-23 | عنوان | نحتاج إلى ردكم<br>الصيغ: أفراد وشركات «نحتاج إلى ردكم» · خيري «محتاجين ردّك» | public/assets/js/public/portal.js:344 |
| P-24 | زر | الرد علينا<br>الصيغ: أفراد وشركات «الرد علينا» · خيري «ردّ{ي} علينا» | public/assets/js/public/portal.js:346 |
| P-25 | قسم/بطاقة | وصلكم ردنا<br>الصيغ: أفراد وشركات «وصلكم ردنا» · خيري «وصلك ردّنا» | public/assets/js/public/portal.js:352 |
| P-26 | عنوان | الرد على طلبكم جاهز<br>الصيغ: أفراد وشركات «الرد على طلبكم جاهز» · خيري «ردّنا على مشكلتك جاهز» | public/assets/js/public/portal.js:353 |
| P-27 | زر | … الرد | public/assets/js/public/portal.js:354 |
| P-28 | قسم/بطاقة | رسالة جديدة | public/assets/js/public/portal.js:359 |
| P-29 | عنوان | وصلتكم رسالة منا<br>الصيغ: أفراد وشركات «وصلتكم رسالة منا» · خيري «وصلتك رسالة مننا» | public/assets/js/public/portal.js:360 |
| P-30 | زر | … الرسالة | public/assets/js/public/portal.js:361 |
| P-31 | حقل | (نص متغير) | public/assets/js/public/portal.js:378 |
| P-32 | قسم/بطاقة | أهلًا يا {name} | public/assets/js/public/portal.js:397 |
| P-33 | عنوان | أهلًا يا {name} | public/assets/js/public/portal.js:397 |
| P-34 | زر | … بينا | public/assets/js/public/portal.js:408 |
| P-35 | زر | واتساب | public/assets/js/public/portal.js:410 |
| P-36 | زر | راسلونا<br>الصيغ: أفراد وشركات «راسلونا» · خيري «اكتب{ي}لنا» | public/assets/js/public/portal.js:411 |
| P-37 | قسم/بطاقة | طلباتك | public/assets/js/public/portal.js:426 |
| P-38 | عنوان | عندك … | public/assets/js/public/portal.js:427 |
| P-39 | زر | طلب | public/assets/js/public/portal.js:435 |
| P-40 | قسم/بطاقة | حالة طلبكم<br>الصيغ: أفراد وشركات «حالة طلبكم» · خيري «طلبك وصل لفين؟» | public/assets/js/public/portal.js:450 |
| P-41 | عنوان | حالة طلبكم<br>الصيغ: أفراد وشركات «حالة طلبكم» · خيري «طلبك وصل لفين؟» | public/assets/js/public/portal.js:451 |
| P-42 | قائمة روابط | أقسام صفحتك | public/assets/js/public/portal.js:482 |
| P-43 | رابط | (نص متغير) | public/assets/js/public/portal.js:486 |
| P-44 | رابط | وكمان … | public/assets/js/public/portal.js:513 |
| P-45 | قسم/بطاقة | لا يوجد مطلوب منكم الآن.<br>الصيغ: أفراد وشركات «لا يوجد مطلوب منكم الآن.» · خيري «مفيش حاجة مطلوبة منك دلوقتي.» | public/assets/js/public/portal.js:517 |
| P-46 | عنوان | لا يوجد مطلوب منكم الآن.<br>الصيغ: أفراد وشركات «لا يوجد مطلوب منكم الآن.» · خيري «مفيش حاجة مطلوبة منك دلوقتي.» | public/assets/js/public/portal.js:518 |
| P-47 | زر | … مكالمة | public/assets/js/public/portal.js:528 |
| P-48 | قسم/بطاقة | هل تريدون استلام الجديد على واتساب؟<br>الصيغ: أفراد وشركات «هل تريدون استلام الجديد على واتساب؟» · خيري «عايز{ة} يوصلك الجديد على واتساب؟» | public/assets/js/public/portal.js:547 |
| P-49 | عنوان | هل تريدون استلام الجديد على واتساب؟<br>الصيغ: أفراد وشركات «هل تريدون استلام الجديد على واتساب؟» · خيري «عايز{ة} يوصلك الجديد على واتساب؟» | public/assets/js/public/portal.js:548 |
| P-50 | زر | إرسال رقم الطلب<br>الصيغ: أفراد وشركات «إرسال رقم الطلب» · خيري «ابعت{ي} رقم طلبك» | public/assets/js/public/portal.js:550 |
| P-52 | رابط | أو أرسلوا رسالة صوتية على واتساب | public/assets/js/public/portal.js:570 |
| P-53 | رابط | صورة … · … | public/assets/js/public/portal.js:626 |
| P-54 | زر | مش … الورقة دي | public/assets/js/public/portal.js:631 |
| P-55 | حقل | اكتب{ي} هنا… | public/assets/js/public/portal.js:647 |
| P-56 | سؤال قابل للفتح | عايز{ة} تقول{ي} حاجة؟ | public/assets/js/public/portal.js:666 |
| P-57 | عنوان | عايز{ة} تقول{ي} حاجة؟ | public/assets/js/public/portal.js:666 |
| P-58 | زر | ابعت{ي} الورق | public/assets/js/public/portal.js:676 |
| P-59 | زر | ابعت{ي}ها | public/assets/js/public/portal.js:778 |
| P-60 | زر | امسح{ي}ها | public/assets/js/public/portal.js:792 |
| P-61 | زر | … أكتر | public/assets/js/public/portal.js:802 |
| P-62 | قسم/بطاقة | (نص متغير) | public/assets/js/public/portal.js:806 |
| P-63 | قسم/بطاقة | (نص متغير) | public/assets/js/public/portal.js:808 |
| P-64 | زر | تمام | public/assets/js/public/portal.js:818 |
| P-65 | زر | حاول{ي} تاني | public/assets/js/public/portal.js:861 |
| P-66 | زر | ابعت{ي} | public/assets/js/public/portal.js:875 |
| P-67 | زر | اسمع{ي} الرد | public/assets/js/public/portal.js:892 |
| P-68 | قسم/بطاقة | الخطوات التالية<br>الصيغ: أفراد وشركات «الخطوات التالية» · خيري «تعمل{ي} إيه دلوقتي؟» | public/assets/js/public/portal.js:935 |
| P-69 | عنوان | الخطوات التالية<br>الصيغ: أفراد وشركات «الخطوات التالية» · خيري «تعمل{ي} إيه دلوقتي؟» | public/assets/js/public/portal.js:935 |
| P-70 | حقل | (نص متغير) | public/assets/js/public/portal.js:950 |
| P-71 | قسم/بطاقة | الخلاصة | public/assets/js/public/portal.js:971 |
| P-72 | عنوان | الخلاصة | public/assets/js/public/portal.js:971 |
| P-73 | سؤال قابل للفتح | … الرد كامل | public/assets/js/public/portal.js:973 |
| P-74 | عنوان | … الرد كامل | public/assets/js/public/portal.js:973 |
| P-75 | زر | مش فاهم حاجة؟ اسألنا | public/assets/js/public/portal.js:981 |
| P-76 | رابط | الساعة … (… ) | public/assets/js/public/portal.js:1004 |
| P-77 | زر | غيّر{ي} الرد | public/assets/js/public/portal.js:1058 |
| P-78 | زر | هحضر إن شاء الله | public/assets/js/public/portal.js:1063 |
| P-79 | زر | مش هقدر أحضر | public/assets/js/public/portal.js:1064 |
| P-80 | زر | عندي سؤال | public/assets/js/public/portal.js:1065 |
| P-81 | قسم/بطاقة | الساعة … (… ) | public/assets/js/public/portal.js:1073 |
| P-82 | زر | افتح{ي} الخريطة | public/assets/js/public/portal.js:1075 |
| P-83 | عنوان | هات{ي} معاك{ي} | public/assets/js/public/portal.js:1076 |
| P-84 | عنوان | المحامي هيقابلك فين؟ | public/assets/js/public/portal.js:1077 |
| P-85 | رابط | ضيف{ي}ها لتقويم الموبايل | public/assets/js/public/portal.js:1079 |
| P-86 | قسم/بطاقة | بانتظار موافقتكم<br>الصيغ: أفراد وشركات «بانتظار موافقتكم» · خيري «محتاجين موافقتك» | public/assets/js/public/portal.js:1093 |
| P-87 | عنوان | مصاريف للقضية: {a} ({d}) | public/assets/js/public/portal.js:1095 |
| P-88 | زر | موافقة | public/assets/js/public/portal.js:1097 |
| P-89 | زر | استفسار عن المبلغ<br>الصيغ: أفراد وشركات «استفسار عن المبلغ» · خيري «عندي سؤال» | public/assets/js/public/portal.js:1098 |
| P-90 | زر | مش قادر أدفع | public/assets/js/public/portal.js:1099 |
| P-91 | زر | استفسار عن المبلغ<br>الصيغ: أفراد وشركات «استفسار عن المبلغ» · خيري «عندي سؤال على المبلغ» | public/assets/js/public/portal.js:1128 |
| P-92 | قسم/بطاقة | هذه الأتعاب والمصاريف المتفق عليها لطلبكم.<br>الصيغ: أفراد وشركات «هذه الأتعاب والمصاريف المتفق عليها لطلبكم.» · خيري «الاستشارة نفسها مجانية. المبالغ دي مصاريف خاصة بالقضية في المحكمة.» | public/assets/js/public/portal.js:1137 |
| P-93 | سؤال قابل للفتح | طريقة الدفع<br>الصيغ: أفراد وشركات «طريقة الدفع» · خيري «إزاي أدفع؟» | public/assets/js/public/portal.js:1143 |
| P-94 | عنوان | طريقة الدفع<br>الصيغ: أفراد وشركات «طريقة الدفع» · خيري «إزاي أدفع؟» | public/assets/js/public/portal.js:1143 |
| P-95 | رابط | (نص متغير) | public/assets/js/public/portal.js:1179 |
| P-96 | قسم/بطاقة | (نص متغير) | public/assets/js/public/portal.js:1191 |
| P-97 | زر | … مكالمة | public/assets/js/public/portal.js:1191 |
| P-98 | حقل | اكتب{ي} رسالتك هنا… | public/assets/js/public/portal.js:1209 |
| P-99 | زر | إلغاء | public/assets/js/public/portal.js:1231 |
| P-100 | زر | إرسال | public/assets/js/public/portal.js:1236 |
| P-101 | زر | (نص متغير) | public/assets/js/public/portal.js:1278 |
| P-102 | قسم/بطاقة | رسالة جديدة | public/assets/js/public/portal.js:1290 |
| P-103 | قسم/بطاقة | لسه مفيش ورق. | public/assets/js/public/portal.js:1330 |
| P-104 | زر | صوّر{ي} ورقة وابعت{ي}ها | public/assets/js/public/portal.js:1330 |
| P-105 | رابط | (نص متغير) | public/assets/js/public/portal.js:1334 |
| P-106 | قسم/بطاقة | ورق بعتناهولك | public/assets/js/public/portal.js:1339 |
| P-107 | عنوان | ورق بعتناهولك | public/assets/js/public/portal.js:1339 |
| P-108 | قسم/بطاقة | ورق بعت{ي}هولنا | public/assets/js/public/portal.js:1340 |
| P-109 | عنوان | ورق بعت{ي}هولنا | public/assets/js/public/portal.js:1340 |
| P-110 | زر | (نص متغير) | public/assets/js/public/portal.js:1371 |
| P-111 | زر | … المكالمة | public/assets/js/public/portal.js:1375 |
| P-112 | نافذة | إمتى يناسبك نكلمك؟ | public/assets/js/public/portal.js:1376 |
| P-113 | زر | إعادة المحاولة<br>الصيغ: أفراد وشركات «إعادة المحاولة» · خيري «جرب{ي} تاني» | public/assets/js/public/portal.js:1423 |
| P-114 | قسم/بطاقة | (نص متغير) | public/assets/js/public/portal.js:1494 |
| P-115 | عنوان | (نص متغير) | public/assets/js/public/portal.js:1494 |
| P-116 | زر | إعادة المحاولة<br>الصيغ: أفراد وشركات «إعادة المحاولة» · خيري «حاولي تاني» | public/assets/js/public/portal.js:1502 |
| P-117 | زر | إعادة المحاولة<br>الصيغ: أفراد وشركات «إعادة المحاولة» · خيري «حاولي تاني» | public/assets/js/public/portal.js:1511 |
| P-118 | زر | افتحي آخر صفحة محفوظة | public/assets/js/public/portal.js:1525 |
| P-119 | زر | واتساب | public/assets/js/public/portal.js:1527 |
| P-120 | رابط | لديكم موضوع جديد؟ أرسلوه من هنا<br>الصيغ: أفراد وشركات «لديكم موضوع جديد؟ أرسلوه من هنا» · خيري «عندك مشكلة جديدة؟ احكيلنا من هنا» | public/assets/js/public/portal.js:1529 |
| P-123 | عنوان | (نص متغير) | public/assets/js/public/portal-ui.js:192 |

## PL: دخول صفحة المتابعة (`/portal`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| PL-01 | عنوان | … | public/portal-login.html:23 |
| PL-02 | زر | اتصلوا بنا<br>الصيغ: أفراد وشركات «اتصلوا بنا» · خيري «اتصلي بينا» | public/assets/js/public/portal-login.js:49 |
| PL-03 | زر | واتساب | public/assets/js/public/portal-login.js:52 |
| PL-04 | قسم/بطاقة | لديكم طلب لدينا<br>الصيغ: أفراد وشركات «لديكم طلب لدينا» · خيري «عندك طلب عندنا» | public/assets/js/public/portal-login.js:63 |
| PL-05 | عنوان | لديكم طلب لدينا<br>الصيغ: أفراد وشركات «لديكم طلب لدينا» · خيري «عندك طلب عندنا» | public/assets/js/public/portal-login.js:64 |
| PL-06 | زر | فتح صفحة طلبكم<br>الصيغ: أفراد وشركات «فتح صفحة طلبكم» · خيري «افتحي صفحة طلبك» | public/assets/js/public/portal-login.js:65 |
| PL-07 | زر | ليس هاتفكم؟ احذفوها<br>الصيغ: أفراد وشركات «ليس هاتفكم؟ احذفوها» · خيري «مش موبايلك؟ امسحي» | public/assets/js/public/portal-login.js:76 |
| PL-08 | قسم/بطاقة | أرسلتم الطلب من الموقع ولا تجدون الرابط؟<br>الصيغ: أفراد وشركات «أرسلتم الطلب من الموقع ولا تجدون الرابط؟» · خيري «قدّمتي من الموقع ومش لاقية الرابط؟» | public/assets/js/public/portal-login.js:90 |
| PL-09 | عنوان | أرسلتم الطلب من الموقع ولا تجدون الرابط؟<br>الصيغ: أفراد وشركات «أرسلتم الطلب من الموقع ولا تجدون الرابط؟» · خيري «قدّمتي من الموقع ومش لاقية الرابط؟» | public/assets/js/public/portal-login.js:91 |
| PL-10 | سؤال قابل للفتح | للتجربة | public/assets/js/public/portal-login.js:102 |
| PL-11 | عنوان | للتجربة | public/assets/js/public/portal-login.js:102 |
| PL-12 | حقل | (نص متغير) | public/assets/js/public/portal-login.js:125 |
| PL-13 | زر | إرسال الكود<br>الصيغ: أفراد وشركات «إرسال الكود» · خيري «ابعتولي كود على واتساب» | public/assets/js/public/portal-login.js:128 |
| PL-14 | نموذج | رقم الموبايل<br>الصيغ: أفراد وشركات «رقم الموبايل» · خيري «رقم موبايلك» | public/assets/js/public/portal-login.js:131 |
| PL-15 | قسم/بطاقة | اكتبوا رقم الموبايل الذي أرسلتم منه الطلب، وسيصلكم كود على واتساب.<br>الصيغ: أفراد وشركات «اكتبوا رقم الموبايل الذي أرسلتم منه الطلب، وسيصلكم كود على واتساب.» · خيري «بتكلمينا من رقم عليه واتساب؟» | public/assets/js/public/portal-login.js:158 |
| PL-16 | عنوان | اكتبوا رقم الموبايل الذي أرسلتم منه الطلب، وسيصلكم كود على واتساب.<br>الصيغ: أفراد وشركات «اكتبوا رقم الموبايل الذي أرسلتم منه الطلب، وسيصلكم كود على واتساب.» · خيري «بتكلمينا من رقم عليه واتساب؟» | public/assets/js/public/portal-login.js:158 |
| PL-17 | رابط | لديكم موضوع جديد؟ أرسلوه من هنا<br>الصيغ: أفراد وشركات «لديكم موضوع جديد؟ أرسلوه من هنا» · خيري «عندك مشكلة جديدة؟ احكيلنا من هنا» | public/assets/js/public/portal-login.js:162 |
| PL-18 | حقل | (نص متغير) | public/assets/js/public/portal-login.js:184 |
| PL-19 | زر | تأكيد<br>الصيغ: أفراد وشركات «تأكيد» · خيري «دخول» | public/assets/js/public/portal-login.js:188 |
| PL-20 | قسم/بطاقة | لم يصلكم الكود؟<br>الصيغ: أفراد وشركات «لم يصلكم الكود؟» · خيري «ما وصلكيش الكود؟» | public/assets/js/public/portal-login.js:284 |
| PL-21 | عنوان | لم يصلكم الكود؟<br>الصيغ: أفراد وشركات «لم يصلكم الكود؟» · خيري «ما وصلكيش الكود؟» | public/assets/js/public/portal-login.js:285 |
| PL-22 | زر | إرسال كود جديد<br>الصيغ: أفراد وشركات «إرسال كود جديد» · خيري «ابعتي كود تاني» | public/assets/js/public/portal-login.js:288 |
| PL-23 | زر | تغيير الرقم<br>الصيغ: أفراد وشركات «تغيير الرقم» · خيري «غيّري الرقم» | public/assets/js/public/portal-login.js:288 |
| PL-24 | نموذج | لو رقمك متسجل عندنا، هيوصلك كود من 6 أرقام على واتساب خلال دقيقة. | public/assets/js/public/portal-login.js:296 |
| PL-25 | قسم/بطاقة | تغيير الرقم<br>الصيغ: أفراد وشركات «تغيير الرقم» · خيري «غيّري الرقم» | public/assets/js/public/portal-login.js:305 |
| PL-26 | زر | تغيير الرقم<br>الصيغ: أفراد وشركات «تغيير الرقم» · خيري «غيّري الرقم» | public/assets/js/public/portal-login.js:305 |
| PL-27 | قسم/بطاقة | الموقع قيد التجهيز | public/assets/js/public/portal-login.js:322 |
| PL-28 | عنوان | الموقع قيد التجهيز | public/assets/js/public/portal-login.js:322 |

## CC: إطار البوابة: الشريط و«المزيد» والصفحة غير الموجودة (`/company#/more`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CC-01 | زر | طلب جديد | public/assets/js/company/shell.js:38 |
| CC-02 | زر | طلب جديد | public/assets/js/company/shell.js:39 |
| CC-03 | رابط | (نص متغير) | public/assets/js/company/shell.js:100 |
| CC-04 | زر | تعليم الكل كمقروء | public/assets/js/company/shell.js:110 |
| CC-05 | رابط | كل الإشعارات | public/assets/js/company/shell.js:112 |
| CC-06 | قائمة روابط | مسار التنقل | public/assets/js/company/shell.js:126 |
| CC-07 | رابط | (نص متغير) | public/assets/js/company/shell.js:129 |
| CC-08 | رابط | إدارتكم القانونية | public/assets/js/company/shell.js:132 |
| CC-09 | زر | الإشعارات | public/assets/js/company/shell.js:139 |
| CC-10 | نافذة | الإشعارات | public/assets/js/company/shell.js:149 |
| CC-11 | زر | قائمة الحساب | public/assets/js/company/shell.js:155 |
| CC-12 | رابط | حسابي والأمان | public/assets/js/company/shell.js:161 |
| CC-13 | رابط | الإشعارات | public/assets/js/company/shell.js:162 |
| CC-14 | زر | تسجيل الخروج | public/assets/js/company/shell.js:163 |
| CC-15 | قسم/بطاقة | (نص متغير) | public/assets/js/company/shell.js:173 |
| CC-16 | قائمة روابط | التنقل الرئيسي | public/assets/js/company/shell.js:183 |
| CC-17 | عنصر قائمة | (نص متغير) | public/assets/js/company/shell.js:188 |
| CC-18 | عنصر قائمة | (نص متغير) | public/assets/js/company/shell.js:189 |
| CC-19 | عنصر قائمة | (نص متغير) | public/assets/js/company/shell.js:190 |
| CC-20 | عنصر قائمة | (نص متغير) | public/assets/js/company/shell.js:191 |
| CC-21 | قائمة روابط | التنقل الرئيسي | public/assets/js/company/shell.js:193 |
| CC-22 | عنصر | المتابعة | public/assets/js/company/shell.js:201 |
| CC-23 | عنصر | الطلبات | public/assets/js/company/shell.js:202 |
| CC-24 | رابط | الذاكرة القانونية | public/assets/js/company/shell.js:203 |
| CC-25 | رسالة | contract | public/assets/js/company/shell.js:11 |
| CC-26 | رابط | الكيانات | public/assets/js/company/shell.js:208 |
| CC-27 | رابط | الأطراف المتعاملة | public/assets/js/company/shell.js:209 |
| CC-28 | عنصر | الفريق | public/assets/js/company/shell.js:213 |
| CC-29 | عنصر | الباقة والاستخدام | public/assets/js/company/shell.js:214 |
| CC-30 | عنصر | بيانات الشركة | public/assets/js/company/shell.js:215 |
| CC-31 | رابط | (نص متغير) | public/assets/js/company/shell.js:241 |
| CC-32 | رابط | انتقال إلى المحتوى | public/assets/js/company/shell.js:329 |
| CC-33 | زر | إعادة المحاولة | public/assets/js/company/main.js:69 |
| CC-34 | نافذة | تسجيل الخروج | public/assets/js/company/main.js:186 |
| CC-35 | زر | إعادة المحاولة | public/assets/js/company/main.js:252 |
| CC-36 | قسم/بطاقة | (نص متغير) | public/assets/js/company/common.js:14 |
| CC-37 | عنوان | (نص متغير) | public/assets/js/company/common.js:15 |
| CC-38 | زر | إعادة المحاولة | public/assets/js/company/common.js:40 |
| CC-39 | قسم/بطاقة | (نص متغير) | public/assets/js/company/common.js:49 |
| CC-40 | عنوان | (نص متغير) | public/assets/js/company/common.js:50 |
| CC-41 | زر | (نص متغير) | public/assets/js/company/common.js:52 |
| CC-42 | قسم/بطاقة | إعادة المحاولة | public/assets/js/company/common.js:61 |
| CC-43 | عنوان | (نص متغير) | public/assets/js/company/common.js:63 |
| CC-44 | زر | إعادة المحاولة | public/assets/js/company/common.js:65 |
| CC-45 | عنصر قائمة | فهمت | public/assets/js/company/common.js:76 |
| CC-46 | نافذة | حساب شركتكم في وضع الاطلاع فقط | public/assets/js/company/common.js:77 |
| CC-47 | قسم/بطاقة | (نص متغير) | public/assets/js/company/common.js:90 |
| CC-48 | قسم/بطاقة | (نص متغير) | public/assets/js/company/common.js:90 |
| CC-49 | عنوان | (نص متغير) | public/assets/js/company/common.js:90 |
| CC-50 | حقل | ابحثوا في الطلبات والذاكرة والمستندات | public/assets/js/company/common.js:97 |
| CC-51 | صف | الفريق | public/assets/js/company/pages/more.js:20 |
| CC-52 | صف | الباقة والاستخدام | public/assets/js/company/pages/more.js:21 |
| CC-53 | صف | بيانات الشركة والكيانات | public/assets/js/company/pages/more.js:22 |
| CC-54 | صف | الإشعارات | public/assets/js/company/pages/more.js:23 |
| CC-55 | صف | حسابي والأمان | public/assets/js/company/pages/more.js:24 |
| CC-56 | صف | (نص متغير) | public/assets/js/company/pages/more.js:26 |
| CC-57 | صف | تسجيل الخروج | public/assets/js/company/pages/more.js:27 |
| CC-58 | رسالة | template | public/assets/js/company/shell.js:12 |
| CC-59 | رسالة | licence | public/assets/js/company/shell.js:13 |
| CC-60 | رسالة | resolution | public/assets/js/company/shell.js:14 |
| CC-61 | رسالة | position | public/assets/js/company/shell.js:15 |
| CC-62 | رسالة | person | public/assets/js/company/shell.js:16 |
| CC-63 | رسالة | policy | public/assets/js/company/shell.js:17 |
| CC-64 | رسالة | dispute | public/assets/js/company/shell.js:18 |
| CC-65 | رسالة | key_date | public/assets/js/company/shell.js:19 |

## CS: الدخول والروابط: الدعوة وتعيين كلمة المرور والحظر (`/company`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CS-01 | حقل | (نص متغير) | public/assets/js/company/pages/login.js:15 |
| CS-02 | زر | إظهار | public/assets/js/company/pages/login.js:16 |
| CS-03 | حقل | name@company.com | public/assets/js/company/pages/login.js:28 |
| CS-04 | حقل | البريد الإلكتروني | public/assets/js/company/pages/login.js:29 |
| CS-05 | حقل | (نص متغير) | public/assets/js/company/pages/login.js:73 |
| CS-06 | زر | تسجيل الدخول | public/assets/js/company/pages/login.js:75 |
| CS-07 | نموذج | كلمة المرور | public/assets/js/company/pages/login.js:82 |
| CS-08 | تنبيه | (نص متغير) | public/assets/js/company/pages/login.js:83 |
| CS-09 | حقل | كلمة المرور | public/assets/js/company/pages/login.js:85 |
| CS-10 | رابط | نسيت كلمة المرور؟ | public/assets/js/company/pages/login.js:91 |
| CS-11 | رابط | فريق العمل والمحامون: الدخول من منصة الفريق | public/assets/js/company/pages/login.js:92 |
| CS-12 | عنوان | تسجيل الدخول | public/assets/js/company/pages/login.js:116 |
| CS-13 | حقل | (نص متغير) | public/assets/js/company/pages/login.js:123 |
| CS-14 | حقل | رمز التحقق | public/assets/js/company/pages/login.js:124 |
| CS-15 | زر | تأكيد | public/assets/js/company/pages/login.js:127 |
| CS-16 | زر | استخدام رمز استرداد بدلًا من ذلك | public/assets/js/company/pages/login.js:128 |
| CS-17 | نموذج | رجوع | public/assets/js/company/pages/login.js:142 |
| CS-18 | رابط | رجوع | public/assets/js/company/pages/login.js:142 |
| CS-19 | عنوان | التحقق بخطوتين | public/assets/js/company/pages/login.js:170 |
| CS-20 | زر | إرسال الرابط | public/assets/js/company/pages/login.js:176 |
| CS-21 | رابط | العودة إلى تسجيل الدخول | public/assets/js/company/pages/login.js:178 |
| CS-22 | نموذج | اكتبوا بريدكم الإلكتروني وسنرسل رابطًا لتعيين كلمة مرور جديدة. | public/assets/js/company/pages/login.js:179 |
| CS-23 | تنبيه | إذا كان البريد مسجلًا لدينا فستصلكم رسالة خلال دقائق. الرابط صالح ساع… | public/assets/js/company/pages/login.js:193 |
| CS-24 | عنوان | استعادة كلمة المرور | public/assets/js/company/pages/login.js:197 |
| CS-25 | عنوان | تفعيل الحساب | public/assets/js/company/pages/link.js:31 |
| CS-26 | تنبيه | (نص متغير) | public/assets/js/company/pages/link.js:32 |
| CS-27 | زر | (نص متغير) | public/assets/js/company/pages/link.js:33 |
| CS-28 | رابط | العودة إلى تسجيل الدخول | public/assets/js/company/pages/link.js:33 |
| CS-29 | حقل | (نص متغير) | public/assets/js/company/pages/link.js:52 |
| CS-30 | حقل | كلمة المرور | public/assets/js/company/pages/link.js:55 |
| CS-31 | حقل | تأكيد كلمة المرور | public/assets/js/company/pages/link.js:56 |
| CS-32 | حقل | الاسم الكامل | public/assets/js/company/pages/link.js:58 |
| CS-33 | حقل | (نص متغير) | public/assets/js/company/pages/link.js:69 |
| CS-34 | رابط | (قراءة الشروط) | public/assets/js/company/pages/link.js:73 |
| CS-35 | زر | تفعيل الحساب والدخول | public/assets/js/company/pages/link.js:79 |
| CS-36 | نموذج | (نص متغير) | public/assets/js/company/pages/link.js:80 |
| CS-37 | عنوان | مرحبًا بكم في إدارتكم القانونية | public/assets/js/company/pages/link.js:117 |
| CS-38 | زر | حفظ كلمة المرور | public/assets/js/company/pages/link.js:127 |
| CS-39 | نموذج | (نص متغير) | public/assets/js/company/pages/link.js:128 |
| CS-40 | عنوان | تعيين كلمة مرور جديدة | public/assets/js/company/pages/link.js:151 |
| CS-41 | زر | تسجيل الخروج | public/assets/js/company/pages/gate.js:13 |
| CS-42 | عنوان | شركتكم تشترط التحقق بخطوتين | public/assets/js/company/pages/gate.js:16 |
| CS-43 | حقل | كلمة المرور الحالية | public/assets/js/company/pages/gate.js:23 |
| CS-44 | حقل | كلمة المرور الجديدة | public/assets/js/company/pages/gate.js:24 |
| CS-45 | حقل | تأكيد كلمة المرور الجديدة | public/assets/js/company/pages/gate.js:25 |
| CS-46 | زر | حفظ كلمة المرور والمتابعة | public/assets/js/company/pages/gate.js:28 |
| CS-47 | نموذج | (نص متغير) | public/assets/js/company/pages/gate.js:29 |
| CS-48 | عنوان | اختاروا كلمة مرور جديدة للمتابعة. | public/assets/js/company/pages/gate.js:56 |

## CW: الترحيب (أول دخول) (`/company#/welcome`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CW-01 | حقل | (نص متغير) | public/assets/js/company/pages/welcome.js:27 |
| CW-02 | قسم/بطاقة | إدارتكم القانونية | public/assets/js/company/pages/welcome.js:37 |
| CW-03 | عنوان | (نص متغير) | public/assets/js/company/pages/welcome.js:38 |
| CW-04 | حقل | (نص متغير) | public/assets/js/company/pages/welcome.js:57 |
| CW-05 | زر | البيانات صحيحة | public/assets/js/company/pages/welcome.js:62 |
| CW-06 | حقل | الاسم القانوني | public/assets/js/company/pages/welcome.js:88 |
| CW-07 | حقل | السجل التجاري | public/assets/js/company/pages/welcome.js:88 |
| CW-08 | حقل | البطاقة الضريبية | public/assets/js/company/pages/welcome.js:88 |
| CW-09 | حقل | العنوان | public/assets/js/company/pages/welcome.js:88 |
| CW-10 | حقل | النشاط | public/assets/js/company/pages/welcome.js:88 |
| CW-11 | حقل | حجم الشركة | public/assets/js/company/pages/welcome.js:88 |
| CW-12 | زر | لاحقًا | public/assets/js/company/pages/welcome.js:89 |
| CW-13 | حقل | الاسم القانوني | public/assets/js/company/pages/welcome.js:110 |
| CW-14 | حقل | (نص متغير) | public/assets/js/company/pages/welcome.js:113 |
| CW-15 | زر | إضافة كيان | public/assets/js/company/pages/welcome.js:136 |
| CW-16 | حقل | الشكل القانوني | public/assets/js/company/pages/welcome.js:138 |
| CW-17 | حقل | العلاقة | public/assets/js/company/pages/welcome.js:138 |
| CW-18 | حقل | السجل التجاري | public/assets/js/company/pages/welcome.js:138 |
| CW-19 | زر | متابعة | public/assets/js/company/pages/welcome.js:147 |
| CW-20 | زر | لا توجد كيانات أخرى | public/assets/js/company/pages/welcome.js:147 |
| CW-21 | حقل | الاسم | public/assets/js/company/pages/welcome.js:159 |
| CW-22 | حقل | البريد الإلكتروني | public/assets/js/company/pages/welcome.js:159 |
| CW-23 | حقل | الدور | public/assets/js/company/pages/welcome.js:159 |
| CW-24 | سؤال قابل للفتح | ما الفرق بين الأدوار؟ | public/assets/js/company/pages/welcome.js:161 |
| CW-25 | عنوان | ما الفرق بين الأدوار؟ | public/assets/js/company/pages/welcome.js:161 |
| CW-26 | زر | إرسال الدعوات | public/assets/js/company/pages/welcome.js:164 |
| CW-27 | حقل | (نص متغير) | public/assets/js/company/pages/welcome.js:185 |
| CW-28 | زر | نسخ الرابط | public/assets/js/company/pages/welcome.js:185 |
| CW-29 | زر | متابعة | public/assets/js/company/pages/welcome.js:186 |
| CW-30 | زر | لاحقًا | public/assets/js/company/pages/welcome.js:192 |
| CW-31 | زر | طلب جديد | public/assets/js/company/pages/welcome.js:204 |
| CW-32 | زر | إضافة عقد | public/assets/js/company/pages/welcome.js:205 |
| CW-33 | زر | الذهاب إلى المتابعة | public/assets/js/company/pages/welcome.js:206 |
| CW-34 | زر | بدء الإعداد (3 خطوات قصيرة) | public/assets/js/company/pages/welcome.js:224 |
| CW-35 | زر | لاحقًا | public/assets/js/company/pages/welcome.js:224 |

## CH: المتابعة (الرئيسية) (`/company#/overview`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CH-01 | زر | (نص متغير) | public/assets/js/company/pages/overview.js:90 |
| CH-02 | صف | (نص متغير) | public/assets/js/company/pages/overview.js:97 |
| CH-03 | تنبيه | اليوم | public/assets/js/company/pages/overview.js:115 |
| CH-04 | تنبيه | لديكم مطالبة مالية متأخرة. الخدمة مستمرة، ويُرجى السداد لتجنب إيقاف ا… | public/assets/js/company/pages/overview.js:117 |
| CH-05 | تنبيه | حساب شركتكم في وضع الاطلاع فقط. يمكنكم عرض الطلبات والمستندات وتنزيله… | public/assets/js/company/pages/overview.js:118 |
| CH-06 | صف | (نص متغير) | public/assets/js/company/pages/overview.js:140 |
| CH-07 | زر | إخفاء | public/assets/js/company/pages/overview.js:141 |
| CH-08 | زر | فهمت | public/assets/js/company/pages/overview.js:149 |
| CH-09 | رابط | الباقة والاستخدام | public/assets/js/company/pages/overview.js:159 |
| CH-10 | صف | (نص متغير) | public/assets/js/company/pages/overview.js:190 |
| CH-11 | رابط | التقويم | public/assets/js/company/pages/overview.js:192 |
| CH-12 | رسالة | contract_review | public/assets/js/company/pages/overview.js:16 |
| CH-13 | رابط | كل الأنواع | public/assets/js/company/pages/overview.js:202 |
| CH-14 | زر | (نص متغير) | public/assets/js/company/pages/overview.js:224 |
| CH-15 | زر | طلب جديد | public/assets/js/company/pages/overview.js:237 |
| CH-16 | حالة فارغة | أرسلوا أول طلب: مراجعة عقد، اتفاقية سرية، مسألة موظف، أو أي سؤال قانو… | public/assets/js/company/pages/overview.js:237 |
| CH-17 | رابط | كل الطلبات | public/assets/js/company/pages/overview.js:238 |
| CH-18 | رسالة | nda | public/assets/js/company/pages/overview.js:16 |
| CH-19 | رسالة | employment | public/assets/js/company/pages/overview.js:16 |
| CH-20 | رسالة | legal_notice | public/assets/js/company/pages/overview.js:16 |

## CR: قائمة الطلبات (`/company#/requests`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CR-01 | زر | (نص متغير) | public/assets/js/company/pages/requests.js:27 |
| CR-02 | زر | عرض المزيد | public/assets/js/company/pages/requests.js:47 |
| CR-03 | رابط | (نص متغير) | public/assets/js/company/pages/requests.js:75 |
| CR-04 | عنصر قائمة | الطلب | public/assets/js/company/pages/requests.js:75 |
| CR-05 | عنصر قائمة | النوع | public/assets/js/company/pages/requests.js:76 |
| CR-06 | عنصر قائمة | الحالة | public/assets/js/company/pages/requests.js:77 |
| CR-07 | عنصر قائمة | الموعد | public/assets/js/company/pages/requests.js:78 |
| CR-08 | عنصر قائمة | أرسله | public/assets/js/company/pages/requests.js:79 |
| CR-09 | عنصر قائمة | آخر تحديث | public/assets/js/company/pages/requests.js:80 |
| CR-10 | جدول | الطلبات | public/assets/js/company/pages/requests.js:82 |
| CR-11 | جدول | الطلبات | public/assets/js/company/pages/requests.js:83 |
| CR-12 | زر | مسح البحث | public/assets/js/company/pages/requests.js:90 |
| CR-13 | حالة فارغة | لا توجد طلبات تطابق البحث. | public/assets/js/company/pages/requests.js:90 |
| CR-14 | حالة فارغة | يرى حساب «اطلاع فقط» الطلبات التي يشاركها زملاؤكم مع فريق الشركة. | public/assets/js/company/pages/requests.js:91 |
| CR-15 | زر | عرض المكتملة | public/assets/js/company/pages/requests.js:92 |
| CR-16 | حالة فارغة | لا توجد طلبات مفتوحة. | public/assets/js/company/pages/requests.js:92 |
| CR-17 | زر | طلب جديد | public/assets/js/company/pages/requests.js:93 |
| CR-18 | حالة فارغة | أرسلوا أول طلب: مراجعة عقد، اتفاقية سرية، مسألة موظف، أو أي سؤال قانو… | public/assets/js/company/pages/requests.js:93 |
| CR-19 | حقل | ابحثوا برقم الطلب أو العنوان | public/assets/js/company/pages/requests.js:151 |
| CR-20 | حقل | النوع | public/assets/js/company/pages/requests.js:157 |
| CR-21 | زر | (نص متغير) | public/assets/js/company/pages/requests.js:160 |
| CR-22 | زر | (نص متغير) | public/assets/js/company/pages/requests.js:172 |
| CR-23 | عنصر قائمة | تطبيق | public/assets/js/company/pages/requests.js:175 |
| CR-24 | نافذة | تصفية حسب النوع | public/assets/js/company/pages/requests.js:175 |

## CN: طلب جديد (`/company#/requests/new`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CN-01 | زر | متابعة المسودة | public/assets/js/company/pages/new-request.js:56 |
| CN-02 | نافذة | حذف المسودة؟ | public/assets/js/company/pages/new-request.js:60 |
| CN-03 | زر | حذف المسودة | public/assets/js/company/pages/new-request.js:65 |
| CN-04 | حقل | (نص متغير) | public/assets/js/company/pages/new-request.js:168 |
| CN-05 | حقل | (نص متغير) | public/assets/js/company/pages/new-request.js:169 |
| CN-06 | حقل | (نص متغير) | public/assets/js/company/pages/new-request.js:173 |
| CN-07 | حقل | (نص متغير) | public/assets/js/company/pages/new-request.js:176 |
| CN-08 | حقل | عنوان مختصر | public/assets/js/company/pages/new-request.js:177 |
| CN-09 | قسم/بطاقة | التفاصيل | public/assets/js/company/pages/new-request.js:214 |
| CN-10 | قسم/بطاقة | التفاصيل | public/assets/js/company/pages/new-request.js:214 |
| CN-11 | عنوان | التفاصيل | public/assets/js/company/pages/new-request.js:214 |
| CN-12 | عنصر قائمة | عادي | public/assets/js/company/pages/new-request.js:237 |
| CN-13 | عنصر قائمة | مرتفع | public/assets/js/company/pages/new-request.js:238 |
| CN-14 | عنصر قائمة | عاجل | public/assets/js/company/pages/new-request.js:239 |
| CN-15 | خيار | ما مدى الاستعجال؟ | public/assets/js/company/pages/new-request.js:249 |
| CN-16 | زر | اختيار «عاجل» | public/assets/js/company/pages/new-request.js:252 |
| CN-17 | حقل | (نص متغير) | public/assets/js/company/pages/new-request.js:253 |
| CN-18 | حقل | لماذا هو عاجل؟ | public/assets/js/company/pages/new-request.js:254 |
| CN-19 | حقل | (نص متغير) | public/assets/js/company/pages/new-request.js:261 |
| CN-20 | حقل | تحتاجونه قبل (اختياري) | public/assets/js/company/pages/new-request.js:263 |
| CN-21 | حقل | اختاروا | public/assets/js/company/pages/new-request.js:273 |
| CN-22 | حقل | الكيان المعني | public/assets/js/company/pages/new-request.js:275 |
| CN-23 | خيار | مَن يرى هذا الطلب في شركتكم؟ | public/assets/js/company/pages/new-request.js:288 |
| CN-24 | زر | (نص متغير) | public/assets/js/company/pages/new-request.js:298 |
| CN-25 | حقل | إشراك زملاء في المتابعة (اختياري) | public/assets/js/company/pages/new-request.js:304 |
| CN-26 | خيار | لغة التسليم | public/assets/js/company/pages/new-request.js:316 |
| CN-27 | قسم/بطاقة | الموعد والخصوصية | public/assets/js/company/pages/new-request.js:321 |
| CN-28 | قسم/بطاقة | الموعد والخصوصية | public/assets/js/company/pages/new-request.js:321 |
| CN-29 | عنوان | الموعد والخصوصية | public/assets/js/company/pages/new-request.js:321 |
| CN-30 | زر | إرسال الطلب | public/assets/js/company/pages/new-request.js:332 |
| CN-31 | قسم/بطاقة | ملخص الطلب | public/assets/js/company/pages/new-request.js:333 |
| CN-32 | عنوان | ملخص الطلب | public/assets/js/company/pages/new-request.js:333 |
| CN-33 | قسم/بطاقة | وصل طلبكم | public/assets/js/company/pages/new-request.js:580 |
| CN-34 | عنوان | وصل طلبكم | public/assets/js/company/pages/new-request.js:581 |
| CN-35 | تنبيه | (نص متغير) | public/assets/js/company/pages/new-request.js:586 |
| CN-36 | عنوان | ماذا يحدث الآن؟ | public/assets/js/company/pages/new-request.js:587 |
| CN-37 | زر | متابعة الطلب | public/assets/js/company/pages/new-request.js:588 |
| CN-38 | زر | طلب جديد آخر | public/assets/js/company/pages/new-request.js:588 |
| CN-39 | رابط | العودة إلى المتابعة | public/assets/js/company/pages/new-request.js:589 |
| CN-40 | زر | متابعة | public/assets/js/company/pages/new-request.js:669 |
| CN-41 | نافذة | تغيير نوع الطلب؟ | public/assets/js/company/pages/new-request.js:679 |
| CN-42 | زر | تغيير | public/assets/js/company/pages/new-request.js:683 |

## CK: أنواع الطلبات وحقولها (`/company#/requests/new`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CK-01 | زر | تعديل المستند | public/assets/js/lib/company-forms.js:139 |
| CK-02 | حقل | تصوير صفحة أخرى | public/assets/js/lib/company-forms.js:331 |
| CK-06 | عنصر قائمة | مراجعة عقد<br>الصيغ: بوابة الشركات «مراجعة عقد» · الفريق «مراجعة عقد قبل التوقيع» | public/assets/js/lib/company-catalog.js:27 |
| CK-07 | عنصر قائمة | صياغة عقد<br>الصيغ: بوابة الشركات «صياغة عقد» · الفريق «إعداد عقد» | public/assets/js/lib/company-catalog.js:46 |
| CK-08 | عنصر قائمة | اتفاقية سرية<br>الصيغ: بوابة الشركات «اتفاقية سرية» · الفريق «اتفاقية سرية (NDA)» | public/assets/js/lib/company-catalog.js:66 |
| CK-09 | عنصر قائمة | مسألة موظف<br>الصيغ: بوابة الشركات «مسألة موظف» · الفريق «مسألة عمالية / موظف» | public/assets/js/lib/company-catalog.js:85 |
| CK-10 | عنصر قائمة | مراجعة حملة تسويقية | public/assets/js/lib/company-catalog.js:104 |
| CK-11 | عنصر قائمة | إنذار أو مطالبة وصلتكم<br>الصيغ: بوابة الشركات «إنذار أو مطالبة وصلتكم» · الفريق «إنذار أو مطالبة وصلت للشركة» | public/assets/js/lib/company-catalog.js:123 |
| CK-12 | عنصر قائمة | قرار مجلس إدارة أو جمعية<br>الصيغ: بوابة الشركات «قرار مجلس إدارة أو جمعية» · الفريق «قرار مجلس إدارة / جمعية» | public/assets/js/lib/company-catalog.js:142 |
| CK-13 | عنصر قائمة | مشكلة مع مورد | public/assets/js/lib/company-catalog.js:161 |
| CK-14 | عنصر قائمة | سؤال امتثال | public/assets/js/lib/company-catalog.js:180 |
| CK-15 | عنصر قائمة | تجديد عقد أو ترخيص<br>الصيغ: بوابة الشركات «تجديد عقد أو ترخيص» · الفريق «متابعة تجديد عقد أو ترخيص» | public/assets/js/lib/company-catalog.js:199 |
| CK-16 | عنصر قائمة | بدء نزاع أو مطالبة<br>الصيغ: بوابة الشركات «بدء نزاع أو مطالبة» · الفريق «بدء نزاع» | public/assets/js/lib/company-catalog.js:218 |
| CK-17 | عنصر قائمة | طلب آخر | public/assets/js/lib/company-catalog.js:237 |
| CK-18 | عنصر | العملة | public/assets/js/lib/company-catalog-fields.js:15 |
| CK-19 | عنصر | الطرف الآخر | public/assets/js/lib/company-catalog-fields.js:40 |
| CK-20 | عنصر | نوع العقد | public/assets/js/lib/company-catalog-fields.js:50 |
| CK-21 | عنصر | صفة شركتكم في العقد | public/assets/js/lib/company-catalog-fields.js:51 |
| CK-22 | عنصر | قيمة العقد (تقريبًا) | public/assets/js/lib/company-catalog-fields.js:52 |
| CK-23 | عنصر | موعد التوقيع | public/assets/js/lib/company-catalog-fields.js:54 |
| CK-24 | عنصر | القانون الحاكم (إن وُجد) | public/assets/js/lib/company-catalog-fields.js:55 |
| CK-25 | عنصر | نوع العقد | public/assets/js/lib/company-catalog-fields.js:59 |
| CK-26 | عنصر | صفة شركتكم في العقد | public/assets/js/lib/company-catalog-fields.js:60 |
| CK-27 | عنصر | الشروط المتفق عليها | public/assets/js/lib/company-catalog-fields.js:61 |
| CK-28 | عنصر | قيمة العقد | public/assets/js/lib/company-catalog-fields.js:62 |
| CK-29 | عنصر | اتجاه السرية | public/assets/js/lib/company-catalog-fields.js:77 |
| CK-30 | عنصر | الغرض من تبادل المعلومات | public/assets/js/lib/company-catalog-fields.js:79 |
| CK-31 | عنصر | استخدام نموذج السرية المعتمد لديكم | public/assets/js/lib/company-catalog-fields.js:80 |
| CK-32 | عنصر | مدة الالتزام بالسرية (بالأشهر) | public/assets/js/lib/company-catalog-fields.js:81 |
| CK-33 | عنصر | وظيفة الموظف | public/assets/js/lib/company-catalog-fields.js:84 |
| CK-34 | عنصر | نوع المسألة | public/assets/js/lib/company-catalog-fields.js:99 |
| CK-35 | عنصر | تاريخ بدء عمله | public/assets/js/lib/company-catalog-fields.js:101 |
| CK-36 | عنصر | هل يوجد عقد عمل مكتوب؟ | public/assets/js/lib/company-catalog-fields.js:112 |
| CK-37 | عنصر | اسم الحملة | public/assets/js/lib/company-catalog-fields.js:116 |
| CK-38 | عنصر | أين ستُنشر؟ | public/assets/js/lib/company-catalog-fields.js:131 |
| CK-39 | عنصر | موعد الإطلاق | public/assets/js/lib/company-catalog-fields.js:133 |
| CK-40 | عنصر | هل تتضمن الحملة… | public/assets/js/lib/company-catalog-fields.js:147 |
| CK-41 | عنصر | الجهة المرسِلة | public/assets/js/lib/company-catalog-fields.js:151 |
| CK-42 | عنصر | نوعه | public/assets/js/lib/company-catalog-fields.js:164 |
| CK-43 | عنصر | تاريخ الاستلام | public/assets/js/lib/company-catalog-fields.js:166 |
| CK-44 | عنصر | آخر موعد للرد (إن ذُكر) | public/assets/js/lib/company-catalog-fields.js:167 |
| CK-45 | عنصر | المبلغ المطالب به | public/assets/js/lib/company-catalog-fields.js:168 |
| CK-46 | عنصر | الجهة المصدِرة للقرار | public/assets/js/lib/company-catalog-fields.js:182 |
| CK-47 | عنصر | موضوع القرار | public/assets/js/lib/company-catalog-fields.js:198 |
| CK-48 | عنصر | موعد الاجتماع (إن تحدد) | public/assets/js/lib/company-catalog-fields.js:200 |
| CK-49 | عنصر | اسم المورد | public/assets/js/lib/company-catalog-fields.js:203 |
| CK-50 | عنصر | نوع المشكلة | public/assets/js/lib/company-catalog-fields.js:217 |
| CK-51 | عنصر | المبلغ محل الخلاف | public/assets/js/lib/company-catalog-fields.js:219 |
| CK-52 | عنصر | العقد مع المورد (من ذاكرتكم) | public/assets/js/lib/company-catalog-fields.js:221 |
| CK-53 | عنصر | مجال السؤال | public/assets/js/lib/company-catalog-fields.js:240 |
| CK-54 | عنصر | العقد أو الترخيص | public/assets/js/lib/company-catalog-fields.js:244 |
| CK-55 | عنصر | اسم العقد أو الترخيص | public/assets/js/lib/company-catalog-fields.js:245 |
| CK-56 | عنصر | تاريخ الانتهاء | public/assets/js/lib/company-catalog-fields.js:246 |
| CK-57 | عنصر | ماذا تريدون؟ | public/assets/js/lib/company-catalog-fields.js:258 |
| CK-58 | عنصر | نوع النزاع | public/assets/js/lib/company-catalog-fields.js:276 |
| CK-59 | عنصر | أين وصل النزاع؟ | public/assets/js/lib/company-catalog-fields.js:289 |
| CK-60 | عنصر | النتيجة التي تريدونها | public/assets/js/lib/company-catalog-fields.js:291 |
| CK-61 | عنصر | المبلغ | public/assets/js/lib/company-catalog-fields.js:292 |
| CK-62 | عنصر | ما مدى الاستعجال؟ | public/assets/js/lib/company-catalog-fields.js:392 |
| CK-63 | عنصر | لماذا هو عاجل؟ | public/assets/js/lib/company-catalog-fields.js:394 |
| CK-64 | عنصر | تحتاجونه قبل (اختياري) | public/assets/js/lib/company-catalog-fields.js:395 |
| CK-65 | عنصر | الكيان المعني | public/assets/js/lib/company-catalog-fields.js:396 |
| CK-66 | عنصر | مَن يرى هذا الطلب في شركتكم؟ | public/assets/js/lib/company-catalog-fields.js:404 |
| CK-67 | عنصر | إشراك زملاء في المتابعة (اختياري) | public/assets/js/lib/company-catalog-fields.js:406 |
| CK-68 | عنصر | لغة التسليم | public/assets/js/lib/company-catalog-fields.js:407 |
| CK-69 | عنصر | (نص متغير) | public/assets/js/lib/company-catalog-fields.js:428 |
| CK-70 | عنصر | الملخص | public/assets/js/lib/company-catalog-fields.js:429 |
| CK-71 | عنصر | الطرف الآخر | public/assets/js/lib/company-catalog-fields.js:435 |
| CK-72 | عنصر | الكيان | public/assets/js/lib/company-catalog-fields.js:436 |
| CK-73 | عنصر | نوع العقد | public/assets/js/lib/company-catalog-fields.js:437 |
| CK-74 | عنصر | صفة شركتكم | public/assets/js/lib/company-catalog-fields.js:438 |
| CK-75 | عنصر | تاريخ البدء | public/assets/js/lib/company-catalog-fields.js:439 |
| CK-76 | عنصر | تاريخ الانتهاء | public/assets/js/lib/company-catalog-fields.js:440 |
| CK-77 | عنصر | التجديد | public/assets/js/lib/company-catalog-fields.js:450 |
| CK-78 | عنصر | مدة التجديد (بالأشهر) | public/assets/js/lib/company-catalog-fields.js:452 |
| CK-79 | عنصر | مهلة الإخطار بعدم التجديد (بالأيام) | public/assets/js/lib/company-catalog-fields.js:453 |
| CK-80 | عنصر | القيمة | public/assets/js/lib/company-catalog-fields.js:454 |
| CK-81 | عنصر | العملة | public/assets/js/lib/company-catalog-fields.js:455 |
| CK-82 | عنصر | القانون الحاكم | public/assets/js/lib/company-catalog-fields.js:456 |
| CK-83 | عنصر | موقَّع؟ | public/assets/js/lib/company-catalog-fields.js:457 |
| CK-84 | عنصر | تاريخ التوقيع | public/assets/js/lib/company-catalog-fields.js:458 |
| CK-85 | عنصر | أهم الشروط | public/assets/js/lib/company-catalog-fields.js:459 |
| CK-86 | عنصر | نوع النموذج | public/assets/js/lib/company-catalog-fields.js:476 |
| CK-87 | عنصر | الإصدار | public/assets/js/lib/company-catalog-fields.js:478 |
| CK-88 | عنصر | تاريخ الاعتماد | public/assets/js/lib/company-catalog-fields.js:479 |
| CK-89 | عنصر | اعتمده | public/assets/js/lib/company-catalog-fields.js:480 |
| CK-90 | عنصر | الجهة المصدرة | public/assets/js/lib/company-catalog-fields.js:485 |
| CK-91 | عنصر | رقم الترخيص | public/assets/js/lib/company-catalog-fields.js:486 |
| CK-92 | عنصر | الكيان | public/assets/js/lib/company-catalog-fields.js:487 |
| CK-93 | عنصر | تاريخ الانتهاء | public/assets/js/lib/company-catalog-fields.js:488 |
| CK-94 | عنصر | ابدؤوا التجديد قبل (يومًا) | public/assets/js/lib/company-catalog-fields.js:489 |
| CK-95 | عنصر | الجهة | public/assets/js/lib/company-catalog-fields.js:503 |
| CK-96 | عنصر | تاريخ الاجتماع | public/assets/js/lib/company-catalog-fields.js:505 |
| CK-97 | عنصر | الموضوع | public/assets/js/lib/company-catalog-fields.js:506 |
| CK-98 | عنصر | الكيان | public/assets/js/lib/company-catalog-fields.js:507 |
| CK-99 | عنصر | الموضوع | public/assets/js/lib/company-catalog-fields.js:511 |
| CK-100 | عنصر | القرار | public/assets/js/lib/company-catalog-fields.js:512 |
| CK-101 | عنصر | صادر عن | public/assets/js/lib/company-catalog-fields.js:513 |
| CK-102 | عنصر | التاريخ | public/assets/js/lib/company-catalog-fields.js:514 |
| CK-103 | عنصر | ينطبق على | public/assets/js/lib/company-catalog-fields.js:515 |
| CK-104 | عنصر | الاسم | public/assets/js/lib/company-catalog-fields.js:518 |
| CK-105 | عنصر | الصفة | public/assets/js/lib/company-catalog-fields.js:519 |
| CK-106 | عنصر | نوع التفويض | public/assets/js/lib/company-catalog-fields.js:532 |
| CK-107 | عنصر | حد التفويض | public/assets/js/lib/company-catalog-fields.js:534 |
| CK-108 | عنصر | مرجع التوكيل | public/assets/js/lib/company-catalog-fields.js:535 |
| CK-109 | عنصر | صالح حتى | public/assets/js/lib/company-catalog-fields.js:536 |
| CK-110 | عنصر | الكيان | public/assets/js/lib/company-catalog-fields.js:537 |
| CK-111 | عنصر | النوع | public/assets/js/lib/company-catalog-fields.js:552 |
| CK-112 | عنصر | الإصدار | public/assets/js/lib/company-catalog-fields.js:554 |
| CK-113 | عنصر | تاريخ الاعتماد | public/assets/js/lib/company-catalog-fields.js:555 |
| CK-114 | عنصر | الطرف الآخر | public/assets/js/lib/company-catalog-fields.js:560 |
| CK-115 | عنصر | الجهة | public/assets/js/lib/company-catalog-fields.js:572 |
| CK-116 | عنصر | صفتكم | public/assets/js/lib/company-catalog-fields.js:582 |
| CK-117 | عنصر | المرحلة | public/assets/js/lib/company-catalog-fields.js:584 |
| CK-118 | عنصر | الموعد القادم | public/assets/js/lib/company-catalog-fields.js:585 |
| CK-119 | عنصر | النتيجة | public/assets/js/lib/company-catalog-fields.js:586 |
| CK-120 | عنصر | التاريخ | public/assets/js/lib/company-catalog-fields.js:591 |
| CK-121 | عنصر | التكرار | public/assets/js/lib/company-catalog-fields.js:602 |
| CK-122 | عنصر | ملاحظة | public/assets/js/lib/company-catalog-fields.js:604 |
| CK-123 | عنصر | مَن يراه | public/assets/js/lib/company-catalog-fields.js:619 |
| CK-124 | عنصر | التذكير قبل | public/assets/js/lib/company-catalog-fields.js:621 |
| CK-125 | زر | إعادة المحاولة | public/assets/js/lib/company-forms.js:107 |
| CK-126 | زر | (نص متغير) | public/assets/js/lib/company-forms.js:120 |
| CK-127 | زر | (نص متغير) | public/assets/js/lib/company-forms.js:442 |
| CK-128 | سؤال قابل للفتح | تفاصيل إضافية (اختياري) | public/assets/js/lib/company-forms.js:553 |
| CK-129 | عنوان | تفاصيل إضافية (اختياري) | public/assets/js/lib/company-forms.js:553 |
| CK-130 | رابط | عنصر في الذاكرة القانونية | public/assets/js/lib/company-forms.js:599 |
| CK-131 | زر | حفظ العقد | public/assets/js/lib/company-forms.js:635 |
| CK-132 | نموذج | (نص متغير) | public/assets/js/lib/company-forms.js:636 |
| CK-133 | عنصر قائمة | العربية | public/assets/js/lib/company-catalog.js:345 |
| CK-134 | عنصر قائمة | English | public/assets/js/lib/company-catalog.js:346 |
| CK-135 | عنصر قائمة | العربية والإنجليزية | public/assets/js/lib/company-catalog.js:347 |
| CK-136 | عنصر قائمة | كل فريق الشركة على البوابة | public/assets/js/lib/company-catalog.js:380 |
| CK-137 | عنصر قائمة | أنا ومديرو البوابة فقط | public/assets/js/lib/company-catalog.js:381 |

## CQ: صفحة الطلب (`/company#/requests/`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CQ-01 | قسم/بطاقة | (نص متغير) | public/assets/js/company/pages/request.js:44 |
| CQ-02 | قسم/بطاقة | (نص متغير) | public/assets/js/company/pages/request.js:44 |
| CQ-03 | عنوان | (نص متغير) | public/assets/js/company/pages/request.js:44 |
| CQ-04 | رابط | (نص متغير) | public/assets/js/company/pages/request.js:57 |
| CQ-05 | زر | إعادة المحاولة | public/assets/js/company/pages/request.js:82 |
| CQ-06 | زر | (نص متغير) | public/assets/js/company/pages/request.js:129 |
| CQ-07 | حقل | اكتبوا رسالة إلى فريقكم القانوني | public/assets/js/company/pages/request.js:152 |
| CQ-08 | زر | إرفاق | public/assets/js/company/pages/request.js:166 |
| CQ-09 | زر | إرسال | public/assets/js/company/pages/request.js:168 |
| CQ-10 | عنصر قائمة | رجوع | public/assets/js/company/pages/request.js:224 |
| CQ-11 | عنصر قائمة | تأكيد الموافقة | public/assets/js/company/pages/request.js:241 |
| CQ-12 | نافذة | الموافقة على عرض السعر | public/assets/js/company/pages/request.js:244 |
| CQ-13 | عنصر قائمة | رجوع | public/assets/js/company/pages/request.js:256 |
| CQ-14 | عنصر قائمة | رفض العرض وإلغاء الطلب | public/assets/js/company/pages/request.js:277 |
| CQ-15 | نافذة | رفض عرض السعر | public/assets/js/company/pages/request.js:280 |
| CQ-16 | حقل | (نص متغير) | public/assets/js/company/pages/request.js:297 |
| CQ-17 | حقل | (نص متغير) | public/assets/js/company/pages/request.js:303 |
| CQ-18 | حقل | (نص متغير) | public/assets/js/company/pages/request.js:304 |
| CQ-19 | سؤال قابل للفتح | تسجيل قرار الإدارة في الذاكرة القانونية | public/assets/js/company/pages/request.js:305 |
| CQ-20 | عنوان | تسجيل قرار الإدارة في الذاكرة القانونية | public/assets/js/company/pages/request.js:305 |
| CQ-21 | حقل | الموضوع | public/assets/js/company/pages/request.js:305 |
| CQ-22 | حقل | القرار | public/assets/js/company/pages/request.js:305 |
| CQ-23 | عنصر قائمة | اعتماد وإغلاق الطلب | public/assets/js/company/pages/request.js:338 |
| CQ-24 | نافذة | اعتماد التسليم | public/assets/js/company/pages/request.js:341 |
| CQ-25 | عنصر قائمة | إرسال طلب التعديل | public/assets/js/company/pages/request.js:386 |
| CQ-26 | نافذة | طلب تعديلات | public/assets/js/company/pages/request.js:389 |
| CQ-27 | عنصر قائمة | إرسال التصعيد | public/assets/js/company/pages/request.js:423 |
| CQ-28 | نافذة | تصعيد إلى إدارة المكتب | public/assets/js/company/pages/request.js:426 |
| CQ-29 | زر | يمكن اختيار 10 زملاء على الأكثر. | public/assets/js/company/pages/request.js:458 |
| CQ-30 | نافذة | المتابعون من زملائكم | public/assets/js/company/pages/request.js:492 |
| CQ-31 | عنصر قائمة | رفع المستندات | public/assets/js/company/pages/request.js:526 |
| CQ-32 | نافذة | إضافة مستندات | public/assets/js/company/pages/request.js:529 |
| CQ-33 | نافذة | لن يعمل فريقكم القانوني على هذا الطلب، ولا يمكن التراجع. يمكنكم إرسال… | public/assets/js/company/pages/request.js:534 |
| CQ-34 | قسم/بطاقة | خيارات الطلب | public/assets/js/company/pages/request.js:578 |
| CQ-35 | زر | خيارات الطلب | public/assets/js/company/pages/request.js:578 |
| CQ-36 | عنوان | (نص متغير) | public/assets/js/company/pages/request.js:579 |
| CQ-37 | زر | تصعيد إلى إدارة المكتب | public/assets/js/company/pages/request.js:588 |
| CQ-38 | قسم/بطاقة | أين وصل طلبكم؟ | public/assets/js/company/pages/request.js:614 |
| CQ-39 | قسم/بطاقة | التسليمات | public/assets/js/company/pages/request.js:687 |
| CQ-40 | سؤال قابل للفتح | (نص متغير) | public/assets/js/company/pages/request.js:691 |
| CQ-41 | عنوان | (نص متغير) | public/assets/js/company/pages/request.js:691 |
| CQ-42 | زر | عرض الوصف كاملًا | public/assets/js/company/pages/request.js:710 |
| CQ-43 | قسم/بطاقة | تفاصيل الطلب | public/assets/js/company/pages/request.js:711 |
| CQ-44 | زر | إضافة مستندات | public/assets/js/company/pages/request.js:717 |
| CQ-45 | قسم/بطاقة | المستندات | public/assets/js/company/pages/request.js:718 |
| CQ-46 | قسم/بطاقة | من الذاكرة القانونية | public/assets/js/company/pages/request.js:729 |
| CQ-47 | رابط | (نص متغير) | public/assets/js/company/pages/request.js:732 |
| CQ-48 | قسم/بطاقة | المحادثة | public/assets/js/company/pages/request.js:738 |
| CQ-49 | تنبيه | (نص متغير) | public/assets/js/company/pages/request.js:744 |
| CQ-50 | عنصر | ملاحظة لفريقكم القانوني (اختياري) | public/assets/js/company/pages/request.js:213 |
| CQ-51 | عنصر | سبب الرفض | public/assets/js/company/pages/request.js:249 |
| CQ-52 | عنصر | تعليق (اختياري) | public/assets/js/company/pages/request.js:288 |
| CQ-53 | عنصر | ما الذي تحتاجون تعديله؟ | public/assets/js/company/pages/request.js:355 |
| CQ-54 | عنصر | ما المشكلة؟ | public/assets/js/company/pages/request.js:395 |
| CQ-55 | عنصر قائمة | حفظ | public/assets/js/company/pages/request.js:488 |
| CQ-56 | عنصر قائمة | تصعيد إلى إدارة المكتب | public/assets/js/company/pages/request.js:558 |
| CQ-57 | عنصر قائمة | المتابعون من زملائكم | public/assets/js/company/pages/request.js:559 |
| CQ-58 | عنصر قائمة | إلغاء الطلب | public/assets/js/company/pages/request.js:560 |
| CQ-59 | عنصر قائمة | نسخ رابط الطلب | public/assets/js/company/pages/request.js:572 |
| CQ-60 | زر | خيارات الطلب | public/assets/js/company/pages/request.js:578 |

## CU: مكوّنات البوابة: العرض والتسليم والاستيضاح والوعد والعدّاد (يظهر في: داخل صفحات بوابة الشركات: الطلب والتسليم والاستيضاح)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CU-01 | قسم/بطاقة | فريقكم القانوني يحتاج منكم | public/assets/js/lib/company-ui.js:97 |
| CU-02 | عنوان | فريقكم القانوني يحتاج منكم | public/assets/js/lib/company-ui.js:99 |
| CU-03 | زر | إرسال الرد | public/assets/js/lib/company-ui.js:38 |
| CU-04 | زر | تراجع | public/assets/js/lib/company-ui.js:42 |
| CU-05 | زر | إرفاق | public/assets/js/lib/company-ui.js:43 |
| CU-06 | زر | غير متوفر لدينا | public/assets/js/lib/company-ui.js:44 |
| CU-07 | زر | نعم، غير متوفر | public/assets/js/lib/company-ui.js:81 |
| CU-08 | زر | سنرفقه | public/assets/js/lib/company-ui.js:81 |
| CU-09 | حقل | (نص متغير) | public/assets/js/lib/company-ui.js:36 |
| CU-10 | عنصر قائمة | (نص متغير) | public/assets/js/lib/company-ui.js:61 |
| CU-11 | قسم/بطاقة | عرض سعر بانتظار موافقتكم | public/assets/js/lib/company-ui.js:142 · public/assets/js/lib/company-ui.js:124 |
| CU-12 | عنوان | عرض سعر بانتظار موافقتكم | public/assets/js/lib/company-ui.js:143 |
| CU-13 | زر | الموافقة على العرض | public/assets/js/lib/company-ui.js:131 |
| CU-14 | زر | رفض العرض | public/assets/js/lib/company-ui.js:132 |
| CU-15 | زر | مناقشة العرض | public/assets/js/lib/company-ui.js:133 · public/assets/js/lib/company-ui.js:138 |
| CU-16 | سؤال قابل للفتح | الافتراضات وما لا يشمله العرض | public/assets/js/lib/company-ui.js:148 |
| CU-17 | عنصر قائمة | عرض | public/assets/js/lib/company-ui.js:166 |
| CU-18 | رابط | عرض | public/assets/js/lib/company-ui.js:171 |
| CU-19 | رابط | تنزيل | public/assets/js/lib/company-ui.js:172 |
| CU-20 | قسم/بطاقة | تسليم مرحلي | public/assets/js/lib/company-ui.js:187 |
| CU-21 | عنوان | (نص متغير) | public/assets/js/lib/company-ui.js:188 |
| CU-22 | عنوان | (نص متغير) | public/assets/js/lib/company-ui.js:190 |
| CU-23 | سؤال قابل للفتح | قراءة المذكرة كاملة | public/assets/js/lib/company-ui.js:195 |
| CU-24 | زر | اعتماد التسليم | public/assets/js/lib/company-ui.js:200 |
| CU-25 | زر | طلب تعديلات | public/assets/js/lib/company-ui.js:202 |
| CU-26 | قسم/بطاقة | (نص متغير) | public/assets/js/lib/company-ui.js:323 |
| CU-27 | حقل | ابحثوا في الطلبات والذاكرة والمستندات | public/assets/js/lib/company-ui.js:232 |
| CU-28 | قسم/بطاقة | (نص متغير) | public/assets/js/lib/company-ui.js:264 |
| CU-29 | قسم/بطاقة | فريقكم القانوني يحتاج منكم | public/assets/js/lib/company-ui.js:99 |
| CU-30 | قسم/بطاقة | عرض سعر بانتظار موافقتكم | public/assets/js/lib/company-ui.js:143 |
| CU-31 | نص | (نص متغير) | public/assets/js/lib/company-ui-core.js:94 |
| CU-32 | شارة | متأخر | public/assets/js/lib/company-ui-core.js:99 |
| CU-33 | قسم/بطاقة | (نص متغير) | public/assets/js/lib/company-ui-core.js:144 |
| CU-34 | صف | (نص متغير) | public/assets/js/lib/company-ui-core.js:171 |
| CU-35 | قسم/بطاقة | الطلبات المشمولة المستخدمة | public/assets/js/lib/company-ui-core.js:200 · public/assets/js/lib/company-ui-core.js:183 |
| CU-36 | نص | درجة المخاطر: | public/assets/js/lib/company-ui-core.js:243 |
| CU-37 | نص | في | public/assets/js/lib/company-ui-core.js:249 |
| CU-38 | قائمة | عرض | public/assets/js/company/page-kit.js:135 |
| CU-39 | عنصر قائمة | عرض | public/assets/js/company/page-kit.js:142 |
| CU-40 | زر | عرض | public/assets/js/company/page-kit.js:147 |
| CU-41 | رابط | تنزيل | public/assets/js/company/page-kit.js:148 |
| CU-42 | قسم/بطاقة | (نص متغير) | public/assets/js/company/page-kit.js:168 |
| CU-43 | زر | (نص متغير) | public/assets/js/company/page-kit.js:163 |
| CU-44 | قسم/بطاقة | (نص متغير) | public/assets/js/company/page-kit.js:197 |
| CU-45 | زر | (نص متغير) | public/assets/js/company/page-kit.js:203 |
| CU-46 | نص | (نص متغير) | public/assets/js/company/page-kit.js:225 |
| CU-47 | عنوان | الافتراضات وما لا يشمله العرض | public/assets/js/lib/company-ui.js:148 |
| CU-48 | قسم/بطاقة | (نص متغير) | public/assets/js/lib/company-ui.js:188 |
| CU-49 | عنوان | قراءة المذكرة كاملة | public/assets/js/lib/company-ui.js:195 |
| CU-52 | حقل | (نص متغير) | public/assets/js/company/page-kit.js:218 |

## CM: الذاكرة القانونية وقوائمها (`/company#/memory`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CM-01 | صف | (نص متغير) | public/assets/js/company/pages/memory.js:21 |
| CM-02 | صف | (نص متغير) | public/assets/js/company/pages/memory.js:26 |
| CM-03 | حقل | ابحثوا في الذاكرة القانونية | public/assets/js/company/pages/memory.js:58 |
| CM-04 | رابط | التقويم | public/assets/js/company/pages/memory.js:87 |
| CM-05 | رسالة | contract | public/assets/js/company/pages/memory.js:93 |
| CM-06 | زر | إضافة عقد | public/assets/js/company/pages/memory.js:136 |
| CM-07 | زر | إضافة ترخيص | public/assets/js/company/pages/memory.js:137 |
| CM-08 | حالة فارغة | تُبنى مع كل طلب يُنجَز، ويمكنكم البدء بإضافة عقودكم السارية لنذكّركم… | public/assets/js/company/pages/memory.js:140 |
| CM-09 | قسم/بطاقة | (نص متغير) | public/assets/js/company/pages/memory.js:143 |
| CM-10 | قسم/بطاقة | أقسام الذاكرة | public/assets/js/company/pages/memory.js:143 |
| CM-11 | قسم/بطاقة | أقسام الذاكرة | public/assets/js/company/pages/memory.js:143 |
| CM-12 | عنوان | أقسام الذاكرة | public/assets/js/company/pages/memory.js:143 |
| CM-13 | زر | مسح التصفية | public/assets/js/company/pages/memory-list.js:106 |
| CM-14 | حالة فارغة | لا عناصر تطابق التصفية. | public/assets/js/company/pages/memory-list.js:106 |
| CM-15 | زر | (نص متغير) | public/assets/js/company/pages/memory-list.js:107 |
| CM-16 | حالة فارغة | لا توجد عناصر هنا بعد. | public/assets/js/company/pages/memory-list.js:107 |
| CM-17 | رابط | (نص متغير) | public/assets/js/company/pages/memory-list.js:115 |
| CM-18 | رابط | (نص متغير) | public/assets/js/company/pages/memory-list.js:124 |
| CM-19 | جدول | (نص متغير) | public/assets/js/company/pages/memory-list.js:129 |
| CM-20 | جدول | (نص متغير) | public/assets/js/company/pages/memory-list.js:129 |
| CM-21 | صف | (نص متغير) | public/assets/js/company/pages/memory-list.js:139 |
| CM-22 | زر | (نص متغير) | public/assets/js/company/pages/memory-list.js:154 |
| CM-23 | رسالة | entity | public/assets/js/company/pages/memory-list.js:164 |
| CM-24 | حقل | ابحثوا في الذاكرة القانونية | public/assets/js/company/pages/memory-list.js:182 |
| CM-25 | زر | (نص متغير) | public/assets/js/company/pages/memory-list.js:195 |
| CM-26 | رسالة | template | public/assets/js/company/pages/memory.js:94 |
| CM-27 | رسالة | licence | public/assets/js/company/pages/memory.js:95 |
| CM-28 | رسالة | resolution | public/assets/js/company/pages/memory.js:96 |
| CM-29 | رسالة | position | public/assets/js/company/pages/memory.js:97 |
| CM-30 | رسالة | person | public/assets/js/company/pages/memory.js:98 |
| CM-31 | رسالة | policy | public/assets/js/company/pages/memory.js:99 |
| CM-32 | رسالة | dispute | public/assets/js/company/pages/memory.js:100 |
| CM-33 | رسالة | key_date | public/assets/js/company/pages/memory.js:101 |
| CM-34 | رسالة | entities | public/assets/js/company/pages/memory.js:102 |
| CM-35 | رسالة | counterparties | public/assets/js/company/pages/memory.js:103 |
| CM-36 | رسالة | counterparty | public/assets/js/company/pages/memory-list.js:164 |
| CM-37 | رسالة | الموضوع: «موعد يقترب في ذاكرتكم القانونية» · نص الرسالة: «مرحبًا أ. مريم، يقترب موعد مهم في ذاكرتكم القانونية: تجديد السجل التجاري — 1 نوفمبر 2026…» | public/assets/js/company/pages/memory-list.js:164 |

## CD: المواعيد المهمة (`/company#/memory/calendar`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CD-01 | حالة فارغة | لا مواعيد في هذه الفترة. | public/assets/js/company/pages/calendar.js:52 |
| CD-02 | قسم/بطاقة | (نص متغير) | public/assets/js/company/pages/calendar.js:64 |
| CD-03 | قسم/بطاقة | (نص متغير) | public/assets/js/company/pages/calendar.js:64 |
| CD-04 | عنوان | (نص متغير) | public/assets/js/company/pages/calendar.js:64 |
| CD-05 | رابط | (نص متغير) | public/assets/js/company/pages/calendar.js:72 |
| CD-06 | زر | (نص متغير) | public/assets/js/company/pages/calendar.js:87 |
| CD-07 | حقل | النوع | public/assets/js/company/pages/calendar.js:91 |
| CD-08 | زر | إضافة موعد | public/assets/js/company/pages/calendar.js:97 |

## CG: الكيانات (`/company#/memory/entities`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CG-01 | حقل | (نص متغير) | public/assets/js/company/pages/entities.js:19 |
| CG-02 | حقل | الاسم القانوني | public/assets/js/company/pages/entities.js:30 |
| CG-03 | حقل | الشكل القانوني | public/assets/js/company/pages/entities.js:47 |
| CG-04 | حقل | العلاقة | public/assets/js/company/pages/entities.js:47 |
| CG-05 | حقل | الكيان الأم | public/assets/js/company/pages/entities.js:47 |
| CG-06 | حقل | السجل التجاري | public/assets/js/company/pages/entities.js:47 |
| CG-07 | حقل | البطاقة الضريبية | public/assets/js/company/pages/entities.js:47 |
| CG-08 | حقل | المحافظة أو الاختصاص | public/assets/js/company/pages/entities.js:47 |
| CG-09 | عنصر قائمة | حفظ | public/assets/js/company/pages/entities.js:83 |
| CG-10 | نافذة | تعديل الكيان | public/assets/js/company/pages/entities.js:86 |
| CG-11 | زر | إضافة كيان | public/assets/js/company/pages/entities.js:104 |
| CG-12 | زر | تعديل | public/assets/js/company/pages/entities.js:113 |
| CG-13 | صف | تعديل | public/assets/js/company/pages/entities.js:115 |
| CG-14 | حالة فارغة | لا توجد عناصر هنا بعد. | public/assets/js/company/pages/entities.js:125 |

## CX: الأطراف المتعاملة (`/company#/memory/counterparties`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CX-01 | حالة فارغة | لا أطراف بعد. | public/assets/js/company/pages/counterparties.js:24 |
| CX-02 | زر | عرض العناصر | public/assets/js/company/pages/counterparties.js:36 |
| CX-03 | زر | عرض الطلبات | public/assets/js/company/pages/counterparties.js:37 |
| CX-04 | حقل | ابحثوا باسم الطرف | public/assets/js/company/pages/counterparties.js:44 |

## CI: عنصر في الذاكرة (`/company#/memory/item/`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CI-01 | عنصر قائمة | رفع المستندات | public/assets/js/company/pages/memory-item.js:86 |
| CI-02 | نافذة | إضافة مستندات | public/assets/js/company/pages/memory-item.js:89 |
| CI-03 | زر | تعديل | public/assets/js/company/pages/memory-item.js:109 |
| CI-04 | نافذة | لن يظهر في القوائم ولن تصلكم تذكيرات بمواعيده. يستطيع فريقكم القانوني… | public/assets/js/company/pages/memory-item.js:114 |
| CI-05 | زر | أرشفة | public/assets/js/company/pages/memory-item.js:124 |
| CI-06 | رابط | (نص متغير) | public/assets/js/company/pages/memory-item.js:138 |
| CI-07 | زر | إضافة مستندات | public/assets/js/company/pages/memory-item.js:140 |
| CI-08 | صف | (نص متغير) | public/assets/js/company/pages/memory-item.js:147 |
| CI-09 | صف | (نص متغير) | public/assets/js/company/pages/memory-item.js:153 |

## CE: إضافة عنصر في الذاكرة أو تعديله (`/company#/memory/`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CE-01 | حقل | المستندات | public/assets/js/company/pages/memory-edit.js:47 |
| CE-02 | زر | إلغاء | public/assets/js/company/pages/memory-edit.js:81 |
| CE-03 | قسم/بطاقة | (نص متغير) | public/assets/js/company/pages/memory-edit.js:83 |

## CT: الفريق (`/company#/team`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CT-01 | خيار | الدور | public/assets/js/company/pages/team.js:31 |
| CT-02 | حقل | نسخ الرابط | public/assets/js/company/pages/team.js:36 |
| CT-03 | زر | نسخ الرابط | public/assets/js/company/pages/team.js:55 |
| CT-04 | حقل | (نص متغير) | public/assets/js/company/pages/team.js:63 |
| CT-05 | حقل | (نص متغير) | public/assets/js/company/pages/team.js:64 |
| CT-06 | حقل | (نص متغير) | public/assets/js/company/pages/team.js:65 |
| CT-07 | حقل | (نص متغير) | public/assets/js/company/pages/team.js:67 |
| CT-08 | حقل | الاسم | public/assets/js/company/pages/team.js:68 |
| CT-09 | حقل | البريد الإلكتروني | public/assets/js/company/pages/team.js:69 |
| CT-10 | حقل | الوظيفة | public/assets/js/company/pages/team.js:76 |
| CT-11 | زر | إغلاق | public/assets/js/company/pages/team.js:132 |
| CT-12 | عنصر قائمة | إرسال الدعوة | public/assets/js/company/pages/team.js:135 |
| CT-13 | نافذة | دعوة زميل | public/assets/js/company/pages/team.js:138 |
| CT-14 | عنصر قائمة | إغلاق | public/assets/js/company/pages/team.js:143 |
| CT-15 | نافذة | إعادة إرسال الدعوة | public/assets/js/company/pages/team.js:143 |
| CT-16 | عنصر قائمة | حفظ | public/assets/js/company/pages/team.js:178 |
| CT-17 | نافذة | حفظ | public/assets/js/company/pages/team.js:181 |
| CT-18 | نافذة | يُسجَّل خروجه فورًا ولن يتمكن من الدخول. تبقى طلباته ورسائله كما هي. | public/assets/js/company/pages/team.js:253 |
| CT-19 | رابط | حسابي والأمان | public/assets/js/company/pages/team.js:264 |
| CT-20 | زر | (نص متغير) | public/assets/js/company/pages/team.js:265 |
| CT-21 | صف | (نص متغير) | public/assets/js/company/pages/team.js:277 |
| CT-22 | نافذة | (نص متغير) | public/assets/js/company/pages/team.js:279 |
| CT-23 | زر | (نص متغير) | public/assets/js/company/pages/team.js:282 |
| CT-24 | حقل | (نص متغير) | public/assets/js/company/pages/team.js:296 |
| CT-25 | زر | دعوة زميل | public/assets/js/company/pages/team.js:332 |
| CT-26 | عنصر قائمة | الاسم | public/assets/js/company/pages/team.js:351 |
| CT-27 | عنصر قائمة | الدور | public/assets/js/company/pages/team.js:352 |
| CT-28 | عنصر قائمة | الحالة | public/assets/js/company/pages/team.js:353 |
| CT-29 | عنصر قائمة | التحقق بخطوتين | public/assets/js/company/pages/team.js:354 |
| CT-30 | عنصر قائمة | آخر دخول | public/assets/js/company/pages/team.js:355 |
| CT-31 | عنصر قائمة | (نص متغير) | public/assets/js/company/pages/team.js:356 |
| CT-32 | جدول | الفريق | public/assets/js/company/pages/team.js:358 |
| CT-33 | جدول | الفريق | public/assets/js/company/pages/team.js:359 |
| CT-34 | زر | (نص متغير) | public/assets/js/company/pages/team.js:265 |
| CT-35 | رسالة | company_admin | public/assets/js/company/pages/team.js:18 |
| CT-36 | رسالة | member | public/assets/js/company/pages/team.js:18 |
| CT-37 | رسالة | viewer | public/assets/js/company/pages/team.js:18 |
| CT-38 | عنصر | تغيير الدور | public/assets/js/company/pages/team.js:190 |
| CT-39 | عنصر | إلغاء الاطلاع على التكاليف الإضافية | public/assets/js/company/pages/team.js:194 |
| CT-40 | عنصر | إلغاء الاطلاع على التكاليف الإضافية | public/assets/js/company/pages/team.js:195 |
| CT-41 | عنصر | إرسال رابط تعيين كلمة مرور | public/assets/js/company/pages/team.js:202 |
| CT-42 | عنصر | إعادة إرسال الدعوة | public/assets/js/company/pages/team.js:217 |
| CT-43 | عنصر | تسجيل خروجه من كل الأجهزة | public/assets/js/company/pages/team.js:235 |
| CT-44 | عنصر | إيقاف الحساب | public/assets/js/company/pages/team.js:251 |
| CT-45 | عنصر | إعادة التفعيل | public/assets/js/company/pages/team.js:257 |

## CP: الباقة والاستخدام (`/company#/plan`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CP-01 | سؤال قابل للفتح | أنواع الطلبات المشمولة | public/assets/js/company/pages/plan.js:60 |
| CP-02 | عنوان | أنواع الطلبات المشمولة | public/assets/js/company/pages/plan.js:60 |
| CP-03 | عنصر قائمة | الاستعجال | public/assets/js/company/pages/plan.js:91 |
| CP-04 | عنصر قائمة | الرد الأول | public/assets/js/company/pages/plan.js:92 |
| CP-05 | عنصر قائمة | التسليم لطلب متوسط الحجم | public/assets/js/company/pages/plan.js:93 |
| CP-06 | جدول | مواعيدنا معكم | public/assets/js/company/pages/plan.js:95 |
| CP-07 | جدول | مواعيدنا معكم | public/assets/js/company/pages/plan.js:96 |
| CP-08 | حقل | الدورة | public/assets/js/company/pages/plan.js:153 |
| CP-09 | عنصر قائمة | الوصف | public/assets/js/company/pages/plan.js:178 |
| CP-10 | رابط | (نص متغير) | public/assets/js/company/pages/plan.js:179 |
| CP-11 | عنصر قائمة | الطلب | public/assets/js/company/pages/plan.js:179 |
| CP-12 | عنصر قائمة | الفترة | public/assets/js/company/pages/plan.js:180 |
| CP-13 | عنصر قائمة | المبلغ | public/assets/js/company/pages/plan.js:181 |
| CP-14 | جدول | التكاليف الإضافية المعتمدة | public/assets/js/company/pages/plan.js:183 |
| CP-15 | جدول | التكاليف الإضافية المعتمدة | public/assets/js/company/pages/plan.js:184 |
| CP-16 | حالة فارغة | لا توجد تكاليف إضافية. | public/assets/js/company/pages/plan.js:186 |

## CF: بيانات الشركة (`/company#/company`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CF-01 | حقل | (نص متغير) | public/assets/js/company/pages/company.js:18 |
| CF-02 | حقل | (نص متغير) | public/assets/js/company/pages/company.js:25 |
| CF-03 | حقل | (نص متغير) | public/assets/js/company/pages/company.js:28 |
| CF-04 | حقل | الاسم القانوني | public/assets/js/company/pages/company.js:36 |
| CF-05 | حقل | السجل التجاري | public/assets/js/company/pages/company.js:36 |
| CF-06 | حقل | البطاقة الضريبية | public/assets/js/company/pages/company.js:36 |
| CF-07 | حقل | العنوان | public/assets/js/company/pages/company.js:36 |
| CF-08 | حقل | النشاط | public/assets/js/company/pages/company.js:36 |
| CF-09 | حقل | حجم الشركة | public/assets/js/company/pages/company.js:36 |
| CF-10 | عنصر قائمة | حفظ | public/assets/js/company/pages/company.js:53 |
| CF-11 | نافذة | تعديل بيانات الشركة | public/assets/js/company/pages/company.js:56 |
| CF-12 | زر | تعديل البيانات | public/assets/js/company/pages/company.js:82 |
| CF-13 | رابط | الكيانات | public/assets/js/company/pages/company.js:88 |

## CA: حسابي والأمان (`/company#/account`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CA-01 | حقل | (نص متغير) | public/assets/js/company/pages/account.js:21 |
| CA-02 | حقل | الاسم | public/assets/js/company/pages/account.js:28 |
| CA-03 | حقل | رقم الهاتف (اختياري) | public/assets/js/company/pages/account.js:29 |
| CA-04 | زر | حفظ | public/assets/js/company/pages/account.js:31 |
| CA-05 | نموذج | الوظيفة | public/assets/js/company/pages/account.js:34 |
| CA-06 | حقل | الوظيفة | public/assets/js/company/pages/account.js:36 |
| CA-07 | حقل | البريد الإلكتروني | public/assets/js/company/pages/account.js:38 |
| CA-08 | عنصر قائمة | كل جديد على طلباتي والطلبات التي أتابعها | public/assets/js/company/pages/account.js:70 |
| CA-09 | عنصر قائمة | المهم فقط: سؤال من فريقكم القانوني، عرض سعر، تسليم، موعد يقترب، تكلفة… | public/assets/js/company/pages/account.js:71 |
| CA-10 | عنصر قائمة | لا شيء. رسائل الأمان تصلكم دائمًا | public/assets/js/company/pages/account.js:72 |
| CA-11 | خيار | كل جديد على طلباتي والطلبات التي أتابعها | public/assets/js/company/pages/account.js:82 |
| CA-12 | حقل | كلمة المرور الحالية | public/assets/js/company/pages/account.js:91 |
| CA-13 | حقل | كلمة المرور الجديدة | public/assets/js/company/pages/account.js:92 |
| CA-14 | حقل | تأكيد كلمة المرور الجديدة | public/assets/js/company/pages/account.js:93 |
| CA-15 | زر | تغيير كلمة المرور | public/assets/js/company/pages/account.js:96 |
| CA-16 | نموذج | سيُسجَّل خروجكم من الأجهزة الأخرى. | public/assets/js/company/pages/account.js:97 |
| CA-17 | حقل | (نص متغير) | public/assets/js/company/pages/account.js:129 |
| CA-18 | حقل | كلمة المرور الحالية | public/assets/js/company/pages/account.js:131 |
| CA-19 | حقل | رمز التحقق من التطبيق | public/assets/js/company/pages/account.js:131 |
| CA-20 | عنصر قائمة | إلغاء | public/assets/js/company/pages/account.js:137 |
| CA-21 | نافذة | إلغاء | public/assets/js/company/pages/account.js:157 |
| CA-22 | زر | تفعيل التحقق بخطوتين | public/assets/js/company/pages/account.js:184 |
| CA-23 | زر | إنشاء رموز استرداد جديدة | public/assets/js/company/pages/account.js:201 |
| CA-24 | زر | إيقاف التحقق بخطوتين | public/assets/js/company/pages/account.js:218 |
| CA-25 | زر | تسجيل الخروج | public/assets/js/company/pages/account.js:254 |
| CA-26 | زر | تسجيل الخروج من الأجهزة الأخرى | public/assets/js/company/pages/account.js:271 |
| CA-27 | زر | تسجيل الخروج | public/assets/js/company/pages/account.js:291 |
| CA-28 | عنصر قائمة | (نص متغير) | public/assets/js/company/pages/account.js:154 |

## CB: الإشعارات (`/company#/notifications`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CB-01 | رابط | غير مقروء | public/assets/js/company/pages/notifications.js:44 |
| CB-02 | حالة فارغة | لا إشعارات. | public/assets/js/company/pages/notifications.js:61 |
| CB-03 | زر | تعليم الكل كمقروء | public/assets/js/company/pages/notifications.js:75 |

## NAV: إطار المنصة: القائمة الجانبية والشريط العلوي والجرس وشريط المحامي (`/app`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| NAV-01 | رابط | الإشعارات | public/assets/js/app/shell.js:20 |
| NAV-02 | رابط | حسابي والأمان | public/assets/js/app/shell.js:21 |
| NAV-03 | عنصر قائمة | بوابة المحامي | public/assets/js/app/shell.js:26 |
| NAV-04 | عنصر قائمة | عام | public/assets/js/app/shell.js:27 |
| NAV-05 | عنصر قائمة | اليوم | public/assets/js/app/shell.js:35 |
| NAV-06 | رابط | لوحة المتابعة | public/assets/js/app/shell.js:37 |
| NAV-07 | رابط | صندوق الوارد | public/assets/js/app/shell.js:38 |
| NAV-08 | رابط | بانتظار قرار الإدارة | public/assets/js/app/shell.js:39 |
| NAV-09 | رابط | ملفات الاستشارات | public/assets/js/app/shell.js:40 |
| NAV-10 | رابط | الملفات المستمرة | public/assets/js/app/shell.js:41 |
| NAV-11 | رابط | أصحاب الطلبات | public/assets/js/app/shell.js:42 |
| NAV-12 | رابط | التقويم | public/assets/js/app/shell.js:43 |
| NAV-13 | عنصر قائمة | الشركات | public/assets/js/app/shell.js:47 |
| NAV-14 | رابط | طلبات الشركات | public/assets/js/app/shell.js:47 |
| NAV-15 | رابط | الشركات العميلة | public/assets/js/app/shell.js:47 |
| NAV-16 | عنصر قائمة | المكتب | public/assets/js/app/shell.js:50 |
| NAV-17 | رابط | شبكة المحامين | public/assets/js/app/shell.js:52 |
| NAV-18 | رابط | المحاسبة | public/assets/js/app/shell.js:53 |
| NAV-19 | رابط | البرامج والتمويل | public/assets/js/app/shell.js:54 |
| NAV-20 | رابط | فحص تعارض المصالح | public/assets/js/app/shell.js:55 |
| NAV-21 | رابط | تقرير الأثر | public/assets/js/app/shell.js:56 |
| NAV-22 | رابط | الأتمتة والرسائل | public/assets/js/app/shell.js:57 |
| NAV-23 | رابط | الردود الجاهزة وقوالب واتساب | public/assets/js/app/shell.js:58 |
| NAV-24 | رابط | المعرفة المؤسسية والذكاء الاصطناعي | public/assets/js/app/shell.js:59 |
| NAV-25 | رابط | التسويق والتحليلات | public/assets/js/app/shell.js:60 |
| NAV-26 | عنصر قائمة | النظام | public/assets/js/app/shell.js:65 |
| NAV-27 | رابط | (نص متغير) | public/assets/js/app/shell.js:67 |
| NAV-28 | رابط | الإعدادات والمستخدمون | public/assets/js/app/shell.js:68 |
| NAV-29 | رابط | التكاملات | public/assets/js/app/shell.js:69 |
| NAV-30 | رابط | صحة النظام والنسخ الاحتياطي | public/assets/js/app/shell.js:70 |
| NAV-31 | رابط | سجل الأمان | public/assets/js/app/shell.js:71 |
| NAV-32 | رابط | استيراد وتصدير البيانات | public/assets/js/app/shell.js:72 |
| NAV-33 | رابط | رموز العناصر | public/assets/js/app/shell.js:73 |
| NAV-34 | قائمة روابط | القائمة الرئيسية | public/assets/js/app/shell.js:126 |
| NAV-35 | رابط | منصة المكتب | public/assets/js/app/shell.js:238 |
| NAV-36 | زر | فتح القائمة | public/assets/js/app/shell.js:259 |
| NAV-37 | رابط | لوحة المتابعة | public/assets/js/app/shell.js:262 |
| NAV-38 | زر | الإشعارات | public/assets/js/app/shell.js:267 |
| NAV-39 | زر | تحديد الكل كمقروء | public/assets/js/app/shell.js:272 |
| NAV-40 | قسم/بطاقة | أحدث الإشعارات | public/assets/js/app/shell.js:275 |
| NAV-41 | عنوان | الإشعارات | public/assets/js/app/shell.js:276 |
| NAV-42 | زر | عرض الكل | public/assets/js/app/shell.js:280 |
| NAV-43 | زر | تسجيل الخروج | public/assets/js/app/shell.js:293 |
| NAV-44 | قسم/بطاقة | (نص متغير) | public/assets/js/app/shell.js:302 |
| NAV-45 | زر | تخطَّ إلى المحتوى | public/assets/js/app/shell.js:321 |
| NAV-46 | حالة فارغة | لا توجد إشعارات حتى الآن | public/assets/js/app/shell.js:370 |
| NAV-47 | زر | غير مقروء | public/assets/js/app/shell.js:382 |
| NAV-48 | عنصر قائمة | (نص متغير) | public/assets/js/app/lawyer-shell.js:24 |
| NAV-49 | عنصر قائمة | (نص متغير) | public/assets/js/app/lawyer-shell.js:25 |
| NAV-50 | عنصر قائمة | (نص متغير) | public/assets/js/app/lawyer-shell.js:26 |
| NAV-51 | عنصر قائمة | (نص متغير) | public/assets/js/app/lawyer-shell.js:27 |
| NAV-52 | عنصر قائمة | (نص متغير) | public/assets/js/app/lawyer-shell.js:28 |
| NAV-53 | عنصر قائمة | (نص متغير) | public/assets/js/app/lawyer-shell.js:31 |
| NAV-54 | عنصر قائمة | (نص متغير) | public/assets/js/app/lawyer-shell.js:32 |
| NAV-55 | زر | (نص متغير) | public/assets/js/app/lawyer-shell.js:104 |
| NAV-56 | عنصر قائمة | (نص متغير) | public/assets/js/app/lawyer-shell.js:119 |
| NAV-57 | عنصر قائمة | (نص متغير) | public/assets/js/app/lawyer-shell.js:120 |
| NAV-58 | عنصر قائمة | (نص متغير) | public/assets/js/app/lawyer-shell.js:121 |
| NAV-59 | زر | … : … ، … ، … ، … | public/assets/js/app/lawyer-shell.js:126 |
| NAV-60 | قائمة روابط | التنقل السريع | public/assets/js/app/lawyer-shell.js:128 |
| NAV-61 | عنصر قائمة | إلغاء | public/assets/js/app/lawyer-shell.js:184 |
| NAV-62 | عنصر قائمة | سجّل الخروج | public/assets/js/app/lawyer-shell.js:185 |
| NAV-63 | نافذة | تسجيل الخروج من هذا الجهاز؟ | public/assets/js/app/lawyer-shell.js:188 |
| NAV-64 | عنوان | (نص متغير) | public/assets/js/app/router.js:165 |
| NAV-65 | زر | العودة إلى الصفحة الرئيسية | public/assets/js/app/router.js:166 |
| NAV-66 | حالة فارغة | العودة إلى الصفحة الرئيسية | public/assets/js/app/router.js:166 |
| NAV-67 | نافذة | تسجيل الخروج | public/assets/js/app/main.js:609 |
| NAV-68 | عنوان | (نص متغير) | public/assets/js/app/router.js:165 |

## LGN: الدخول والدعوة واستعادة كلمة المرور والتحقق بخطوتين (`/app#/login`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| LGN-01 | حقل | (نص متغير) | public/assets/js/app/pages/login.js:41 |
| LGN-02 | قسم/بطاقة | حسابات تجريبية | public/assets/js/app/pages/login.js:51 |
| LGN-03 | عنوان | حسابات تجريبية | public/assets/js/app/pages/login.js:52 |
| LGN-04 | زر | دخول | public/assets/js/app/pages/login.js:71 |
| LGN-05 | قسم/بطاقة | منصة المكتب | public/assets/js/app/pages/login.js:85 |
| LGN-06 | عنوان | كل طلب قانوني، من أول رسالة حتى الرد المعتمد، في مكان واحد | public/assets/js/app/pages/login.js:90 |
| LGN-07 | عنوان | تسجيل الدخول | public/assets/js/app/pages/login.js:110 |
| LGN-08 | تنبيه | انتهت جلستك، يرجى تسجيل الدخول مرة أخرى للمتابعة. | public/assets/js/app/pages/login.js:112 |
| LGN-09 | زر | نسيت كلمة المرور؟ | public/assets/js/app/pages/login.js:115 |
| LGN-10 | رابط | العودة إلى موقع | public/assets/js/app/pages/login.js:119 |
| LGN-11 | حقل | (نص متغير) | public/assets/js/app/pages/login.js:132 |
| LGN-12 | زر | أرسل رابطًا إلى واتساب | public/assets/js/app/pages/login.js:134 |
| LGN-13 | زر | اتصل بالمؤسسة | public/assets/js/app/pages/login.js:157 |
| LGN-14 | زر | واتساب | public/assets/js/app/pages/login.js:157 |
| LGN-15 | نافذة | اطلب رابطًا جديدًا من الإدارة | public/assets/js/app/pages/login.js:166 |
| LGN-16 | قسم/بطاقة | منصة المكتب | public/assets/js/app/pages/auth-flows.js:33 |
| LGN-17 | قسم/بطاقة | منصة المكتب | public/assets/js/app/pages/auth-flows.js:34 |
| LGN-18 | رابط | العودة إلى موقع | public/assets/js/app/pages/auth-flows.js:36 |
| LGN-19 | رابط | العودة إلى موقع … | public/assets/js/app/pages/auth-flows.js:36 |
| LGN-20 | عنوان | (نص متغير) | public/assets/js/app/pages/auth-flows.js:41 |
| LGN-21 | تنبيه | (نص متغير) | public/assets/js/app/pages/auth-flows.js:57 |
| LGN-22 | زر | الذهاب إلى تسجيل الدخول | public/assets/js/app/pages/auth-flows.js:59 |
| LGN-23 | زر | (نص متغير) | public/assets/js/app/pages/auth-flows.js:82 |
| LGN-24 | تنبيه | التحقق بخطوتين ما زال مفعّلًا لحسابك؛ جهّز تطبيق المصادقة أو أحد رموز… | public/assets/js/app/pages/auth-flows.js:118 |
| LGN-25 | زر | تسجيل الدخول | public/assets/js/app/pages/auth-flows.js:119 |
| LGN-26 | زر | فقدت هاتفي — استخدام رمز استرداد | public/assets/js/app/pages/auth-flows.js:203 |
| LGN-27 | زر | العودة إلى تسجيل الدخول | public/assets/js/app/pages/auth-flows.js:204 |
| LGN-28 | زر | تسجيل الخروج | public/assets/js/app/pages/auth-flows.js:221 |
| LGN-29 | حقل | (نص متغير) | public/assets/js/app/lh-reauth.js:29 |
| LGN-30 | عنصر قائمة | إلغاء | public/assets/js/app/lh-reauth.js:46 |
| LGN-31 | عنصر قائمة | تأكيد | public/assets/js/app/lh-reauth.js:71 |
| LGN-32 | نافذة | تأكيد كلمة المرور | public/assets/js/app/lh-reauth.js:80 |
| LGN-33 | تنبيه | (نص متغير) | public/assets/js/app/main.js:439 |
| LGN-34 | عنصر قائمة | اسم المستخدم | public/assets/js/app/pages/login.js:21 |
| LGN-35 | عنصر قائمة | كلمة المرور | public/assets/js/app/pages/login.js:22 |
| LGN-36 | زر | تسجيل الدخول | public/assets/js/app/pages/login.js:35 |
| LGN-37 | نموذج | اسم المستخدم | public/assets/js/app/pages/login.js:36 |
| LGN-38 | زر | حفظ | public/assets/js/app/pages/auth-flows.js:123 |
| LGN-39 | نموذج | تفعيل والدخول | public/assets/js/app/pages/auth-flows.js:124 |
| LGN-40 | عنصر قائمة | رمز التحقق | public/assets/js/app/pages/auth-flows.js:155 |
| LGN-41 | عنصر قائمة | رمز الاسترداد | public/assets/js/app/pages/auth-flows.js:156 |
| LGN-42 | زر | تحقق ودخول | public/assets/js/app/pages/auth-flows.js:186 |
| LGN-43 | نموذج | رمز التحقق | public/assets/js/app/pages/auth-flows.js:187 |
| LGN-44 | عنصر قائمة | كلمة المرور المؤقتة الحالية | public/assets/js/app/pages/auth-flows.js:227 |
| LGN-45 | عنصر قائمة | كلمة المرور الجديدة | public/assets/js/app/pages/auth-flows.js:228 |
| LGN-46 | عنصر قائمة | تأكيد كلمة المرور الجديدة | public/assets/js/app/pages/auth-flows.js:229 |
| LGN-47 | زر | حفظ ومتابعة | public/assets/js/app/pages/auth-flows.js:243 |
| LGN-48 | نموذج | كلمة المرور المؤقتة الحالية | public/assets/js/app/pages/auth-flows.js:244 |
| LGN-49 | عنصر قائمة | الاسم الكامل | public/assets/js/app/pages/auth-flows.js:76 |
| LGN-50 | عنصر قائمة | username | public/assets/js/app/pages/auth-flows.js:83 |
| LGN-51 | عنصر قائمة | password | public/assets/js/app/pages/auth-flows.js:85 |
| LGN-52 | عنصر قائمة | تأكيد كلمة المرور | public/assets/js/app/pages/auth-flows.js:86 |
| LGN-53 | عنصر قائمة | أتعهد بالحفاظ على سرية بيانات المستفيدين وعدم استخدامها خارج عمل المؤ… | public/assets/js/app/pages/auth-flows.js:95 |
| LGN-54 | نص | . جميع الحقوق محفوظة. | public/assets/js/app/pages/login.js:104 |

## KIT: مكتبة المكوّنات: الإغلاق والتأكيد وتجاهل التعديلات وإعادة المحاولة واختيار ملف (يظهر في: عناصر مشتركة في كل صفحات المنصة (الإغلاق، التأكيد، إعادة المحاولة، اختيار ملف))

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| KIT-01 | حقل | حتى … ، وحجم الملف الواحد لا يزيد على … | public/assets/js/lib/ui.js:1111 |
| KIT-06 | زر | إغلاق | public/assets/js/lib/ui.js:731 |
| KIT-07 | عنصر قائمة | (نص متغير) | public/assets/js/lib/ui.js:899 |
| KIT-08 | عنصر قائمة | (نص متغير) | public/assets/js/lib/ui.js:900 |
| KIT-09 | نافذة | (نص متغير) | public/assets/js/lib/ui.js:938 |
| KIT-10 | عنصر قائمة | (نص متغير) | public/assets/js/lib/ui.js:934 |
| KIT-11 | عنصر قائمة | (نص متغير) | public/assets/js/lib/ui.js:935 |
| KIT-12 | عنصر قائمة | (نص متغير) | public/assets/js/lib/ui.js:984 |
| KIT-13 | عنصر قائمة | (نص متغير) | public/assets/js/lib/ui.js:985 |
| KIT-14 | زر | إزالة الملف … | public/assets/js/lib/ui.js:1159 |
| KIT-15 | زر | إظهار كلمة المرور | public/assets/js/lib/ui.js:1404 |
| KIT-16 | حالة فارغة | (نص متغير) | public/assets/js/lib/ui.js:1716 |
| KIT-17 | قسم/بطاقة | (نص متغير) | public/assets/js/lib/ui.js:2017 |
| KIT-18 | قسم/بطاقة | إعادة المحاولة | public/assets/js/lib/ui.js:2035 |
| KIT-19 | زر | إعادة المحاولة | public/assets/js/lib/ui.js:2040 |
| KIT-20 | رابط | تنزيل … | public/assets/js/lib/ui.js:1970 |
| KIT-21 | رابط | تنزيل … | public/assets/js/lib/ui.js:1971 |
| KIT-22 | قائمة روابط | مسار التنقل | public/assets/js/lib/ui.js:2069 |
| KIT-23 | زر | إزالة … | public/assets/js/lib/ui.js:2151 |

## SRC: البحث الشامل Ctrl+K (يظهر في: نافذة البحث (Ctrl+K) في المنصة)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| SRC-01 | عنصر قائمة | مستندات | public/assets/js/app/components/search.js:112 |
| SRC-02 | خيار | صفحة … · … | public/assets/js/app/components/search.js:112 |
| SRC-04 | نص | (نص متغير) | public/assets/js/app/components/search.js:131 |
| SRC-05 | قسم/بطاقة | إخفاء رموز العناصر | public/assets/js/app/components/search.js:61 |
| SRC-06 | زر | بحث شامل (… ) | public/assets/js/app/components/search.js:24 |
| SRC-07 | حقل | ابحث في إسناداتك وملفاتك المستمرة | public/assets/js/app/components/search.js:44 |
| SRC-08 | حالة فارغة | لا توجد نتائج لـ «… » | public/assets/js/app/components/search.js:123 |
| SRC-09 | نافذة | البحث في إسناداتي وملفاتي المستمرة | public/assets/js/app/components/search.js:205 |

## DSH: لوحة المتابعة (`/app#/dashboard`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| DSH-01 | عنوان | حسب نوع الطلب | public/assets/js/app/pages/admin/dashboard.js:211 |
| DSH-02 | قائمة | جديد اليوم | public/assets/js/app/pages/admin/dashboard.js:214 |
| DSH-03 | رسالة | consultation | public/assets/js/app/pages/admin/dashboard.js:28 |
| DSH-05 | سؤال قابل للفتح | عرض البيانات كجدول | public/assets/js/app/pages/admin/dashboard.js:94 |
| DSH-06 | عنوان | عرض البيانات كجدول | public/assets/js/app/pages/admin/dashboard.js:94 |
| DSH-07 | قسم/بطاقة | خدمة الشركات | public/assets/js/app/pages/admin/dashboard.js:118 |
| DSH-08 | زر | طلبات الشركات | public/assets/js/app/pages/admin/dashboard.js:129 |
| DSH-09 | بطاقة رقم | بانتظار الفرز | public/assets/js/app/pages/admin/dashboard.js:132 |
| DSH-10 | بطاقة رقم | يقترب موعدها | public/assets/js/app/pages/admin/dashboard.js:133 |
| DSH-11 | بطاقة رقم | متأخرة | public/assets/js/app/pages/admin/dashboard.js:134 |
| DSH-12 | بطاقة رقم | بانتظار الشركات | public/assets/js/app/pages/admin/dashboard.js:135 |
| DSH-13 | بطاقة رقم | تجديدات خلال 30 يومًا | public/assets/js/app/pages/admin/dashboard.js:136 |
| DSH-14 | بطاقة رقم | الاشتراكات الشهرية | public/assets/js/app/pages/admin/dashboard.js:137 |
| DSH-15 | عنوان | خدمة الشركات | public/assets/js/app/pages/admin/dashboard.js:139 |
| DSH-16 | قسم/بطاقة | خدمة الشركات | public/assets/js/app/pages/admin/dashboard.js:140 |
| DSH-17 | عنصر | (نص متغير) | public/assets/js/app/pages/admin/dashboard.js:172 |
| DSH-18 | قسم/بطاقة | حسب نوع الخدمة | public/assets/js/app/pages/admin/dashboard.js:193 |
| DSH-19 | عنوان | حسب نوع الخدمة | public/assets/js/app/pages/admin/dashboard.js:194 |
| DSH-20 | زر | بانتظار قرارك | public/assets/js/app/pages/admin/dashboard.js:257 |
| DSH-21 | زر | صندوق الوارد | public/assets/js/app/pages/admin/dashboard.js:258 |
| DSH-22 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/dashboard.js:260 |
| DSH-23 | عنوان | … ، … | public/assets/js/app/pages/admin/dashboard.js:261 |
| DSH-24 | بطاقة رقم | طلبات جديدة | public/assets/js/app/pages/admin/dashboard.js:274 |
| DSH-25 | بطاقة رقم | عاجلة أو عالية الأولوية | public/assets/js/app/pages/admin/dashboard.js:283 |
| DSH-26 | بطاقة رقم | ملفات مفتوحة | public/assets/js/app/pages/admin/dashboard.js:285 |
| DSH-27 | بطاقة رقم | قرارات بانتظار الإدارة | public/assets/js/app/pages/admin/dashboard.js:293 |
| DSH-28 | بطاقة رقم | إسنادات متأخرة | public/assets/js/app/pages/admin/dashboard.js:302 |
| DSH-29 | بطاقة رقم | متوسط زمن أول رد | public/assets/js/app/pages/admin/dashboard.js:314 |
| DSH-30 | بطاقة رقم | متأخرة عن مستوى الخدمة | public/assets/js/app/pages/admin/dashboard.js:324 |
| DSH-31 | بطاقة رقم | فواتير متأخرة | public/assets/js/app/pages/admin/dashboard.js:333 |
| DSH-32 | بطاقة رقم | رسائل فشل إرسالها | public/assets/js/app/pages/admin/dashboard.js:342 |
| DSH-33 | بطاقة رقم | مواد معرفة بانتظار المراجعة | public/assets/js/app/pages/admin/dashboard.js:351 |
| DSH-34 | عنصر قائمة | (نص متغير) | public/assets/js/app/pages/admin/dashboard.js:18 |
| DSH-35 | عنوان | بانتظار قرارك | public/assets/js/app/pages/admin/dashboard.js:378 |
| DSH-36 | قسم/بطاقة | بانتظار قرارك | public/assets/js/app/pages/admin/dashboard.js:379 |
| DSH-37 | زر | كل الملفات | public/assets/js/app/pages/admin/dashboard.js:389 |
| DSH-38 | رسالة | new | public/assets/js/app/pages/admin/dashboard.js:27 |
| DSH-39 | عنوان | ملفات الاستشارة حسب الحالة | public/assets/js/app/pages/admin/dashboard.js:406 |
| DSH-40 | قسم/بطاقة | ملفات الاستشارة حسب الحالة | public/assets/js/app/pages/admin/dashboard.js:407 |
| DSH-41 | زر | شبكة المحامين | public/assets/js/app/pages/admin/dashboard.js:416 |
| DSH-42 | عنوان | الأعلى تحميلًا | public/assets/js/app/pages/admin/dashboard.js:432 |
| DSH-43 | رابط | … : الإسنادات المفتوحة … من … | public/assets/js/app/pages/admin/dashboard.js:441 |
| DSH-44 | عنوان | الطاقة القانونية | public/assets/js/app/pages/admin/dashboard.js:459 |
| DSH-45 | قسم/بطاقة | الطاقة القانونية | public/assets/js/app/pages/admin/dashboard.js:460 |
| DSH-46 | رابط | يلزم حضور صاحب الطلب | public/assets/js/app/pages/admin/dashboard.js:478 |
| DSH-47 | حالة فارغة | لا توجد جلسات أو مواعيد خلال الأيام السبعة القادمة | public/assets/js/app/pages/admin/dashboard.js:495 |
| DSH-48 | عنوان | مواعيد الأيام السبعة القادمة | public/assets/js/app/pages/admin/dashboard.js:496 |
| DSH-49 | قسم/بطاقة | مواعيد الأيام السبعة القادمة | public/assets/js/app/pages/admin/dashboard.js:497 |
| DSH-50 | رابط | (نص متغير) | public/assets/js/app/pages/admin/dashboard.js:514 |
| DSH-51 | حالة فارغة | لا توجد تنبيهات تشابه للطلبات المفتوحة حاليًا | public/assets/js/app/pages/admin/dashboard.js:522 |
| DSH-52 | عنوان | تنبيهات الحالات المشابهة | public/assets/js/app/pages/admin/dashboard.js:523 |
| DSH-53 | قسم/بطاقة | تنبيهات الحالات المشابهة | public/assets/js/app/pages/admin/dashboard.js:524 |
| DSH-54 | قسم/بطاقة | الخيري | public/assets/js/app/pages/admin/dashboard.js:543 |
| DSH-55 | عنوان | الخيري | public/assets/js/app/pages/admin/dashboard.js:543 |
| DSH-56 | قسم/بطاقة | الأفراد والشركات | public/assets/js/app/pages/admin/dashboard.js:546 |
| DSH-57 | عنوان | الأفراد والشركات | public/assets/js/app/pages/admin/dashboard.js:547 |
| DSH-58 | عنوان | هذا الشهر — | public/assets/js/app/pages/admin/dashboard.js:559 |
| DSH-59 | قسم/بطاقة | هذا الشهر — | public/assets/js/app/pages/admin/dashboard.js:560 |
| DSH-60 | زر | التحليلات | public/assets/js/app/pages/admin/dashboard.js:567 |
| DSH-61 | عنوان | الحجم الأسبوعي | public/assets/js/app/pages/admin/dashboard.js:569 |
| DSH-62 | قسم/بطاقة | الحجم الأسبوعي | public/assets/js/app/pages/admin/dashboard.js:570 |
| DSH-63 | عنصر قائمة | (نص متغير) | public/assets/js/app/pages/admin/dashboard.js:19 |
| DSH-64 | عنصر قائمة | (نص متغير) | public/assets/js/app/pages/admin/dashboard.js:20 |
| DSH-65 | عنصر قائمة | (نص متغير) | public/assets/js/app/pages/admin/dashboard.js:21 |
| DSH-66 | عنصر قائمة | (نص متغير) | public/assets/js/app/pages/admin/dashboard.js:22 |
| DSH-67 | عنصر قائمة | (نص متغير) | public/assets/js/app/pages/admin/dashboard.js:23 |
| DSH-68 | عنصر قائمة | (نص متغير) | public/assets/js/app/pages/admin/dashboard.js:24 |
| DSH-69 | رسالة | assigned | public/assets/js/app/pages/admin/dashboard.js:27 |
| DSH-70 | رسالة | in_progress | public/assets/js/app/pages/admin/dashboard.js:27 |
| DSH-71 | رسالة | under_review | public/assets/js/app/pages/admin/dashboard.js:27 |
| DSH-72 | رسالة | approved | public/assets/js/app/pages/admin/dashboard.js:27 |
| DSH-73 | رسالة | answered | public/assets/js/app/pages/admin/dashboard.js:27 |
| DSH-74 | رسالة | closed | public/assets/js/app/pages/admin/dashboard.js:27 |
| DSH-75 | رسالة | litigation | public/assets/js/app/pages/admin/dashboard.js:28 |
| DSH-76 | رسالة | company | public/assets/js/app/pages/admin/dashboard.js:28 |
| DSH-77 | رسالة | none | public/assets/js/app/pages/admin/dashboard.js:28 |
| DSH-78 | عنصر | إيرادات الأفراد هذا الشهر: | public/assets/js/app/pages/admin/dashboard.js:182 |
| DSH-79 | عنصر | طلبات نوع خدمتها غير محدد: | public/assets/js/app/pages/admin/dashboard.js:186 |
| DSH-80 | عنصر | طلبات أفراد بلا واتساب مؤكد: | public/assets/js/app/pages/admin/dashboard.js:189 |

## INB: صندوق الوارد (`/app#/inbox`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| INB-01 | عنصر | (نص متغير) | public/assets/js/app/pages/admin/inbox.js:818 |
| INB-02 | عنصر | كل الأنواع | public/assets/js/app/pages/admin/inbox.js:191 |
| INB-03 | عنصر | استشارة | public/assets/js/app/pages/admin/inbox.js:192 |
| INB-04 | عنصر | دعوى قضائية | public/assets/js/app/pages/admin/inbox.js:193 |
| INB-05 | عنصر | شركات | public/assets/js/app/pages/admin/inbox.js:194 |
| INB-06 | عنصر | لم يُحدَّد النوع | public/assets/js/app/pages/admin/inbox.js:195 |
| INB-07 | نص | لهذا الرقم طلب أو ملف «خيري» خلال آخر سنة؛ نوع الخدمة لم يتغير | public/assets/js/app/pages/admin/inbox.js:178 |
| INB-08 | نص | أرسل كلمة إيقاف: لا تصله الرسائل الآلية، وردود الفريق تصله كما هي | public/assets/js/app/pages/admin/inbox.js:182 |
| INB-09 | زر | تسجيل طلب يدوي | public/assets/js/app/pages/admin/inbox.js:157 |
| INB-10 | زر | (نص متغير) | public/assets/js/app/pages/admin/inbox.js:287 |
| INB-11 | زر | (نص متغير) | public/assets/js/app/pages/admin/inbox.js:337 |
| INB-12 | زر | (نص متغير) | public/assets/js/app/pages/admin/inbox.js:363 |
| INB-13 | زر | (نص متغير) | public/assets/js/app/pages/admin/inbox.js:391 |
| INB-14 | رابط | بدون اسم | public/assets/js/app/pages/admin/inbox.js:494 |
| INB-15 | زر | سجّل المكالمة | public/assets/js/app/pages/admin/inbox.js:695 |
| INB-16 | زر | لم يرد | public/assets/js/app/pages/admin/inbox.js:696 |
| INB-17 | زر | اسمع الرسالة الصوتية | public/assets/js/app/pages/admin/inbox.js:699 |
| INB-18 | زر | لخّصها الآن | public/assets/js/app/pages/admin/inbox.js:701 |
| INB-19 | زر | حلّل الآن | public/assets/js/app/pages/admin/inbox.js:707 |
| INB-20 | زر | اتصل به | public/assets/js/app/pages/admin/inbox.js:710 |
| INB-21 | زر | (نص متغير) | public/assets/js/app/pages/admin/inbox.js:712 |
| INB-22 | زر | فتح الطلب | public/assets/js/app/pages/admin/inbox.js:715 |
| INB-23 | رابط | بدون اسم | public/assets/js/app/pages/admin/inbox.js:725 |
| INB-24 | زر | مسح الفلاتر | public/assets/js/app/pages/admin/inbox.js:756 |
| INB-25 | زر | عرض كل الأنواع | public/assets/js/app/pages/admin/inbox.js:768 |
| INB-26 | حالة فارغة | (نص متغير) | public/assets/js/app/pages/admin/inbox.js:780 |
| INB-27 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/inbox.js:780 |
| INB-28 | قسم/بطاقة | الطلبات الواردة | public/assets/js/app/pages/admin/inbox.js:785 |
| INB-29 | زر | عرض المزيد (… ) | public/assets/js/app/pages/admin/inbox.js:792 |
| INB-30 | حقل | بحث في الطلبات | public/assets/js/app/pages/admin/inbox.js:852 |
| INB-31 | حقل | (نص متغير) | public/assets/js/app/pages/admin/inbox.js:865 |
| INB-32 | حقل | بحث في الطلبات | public/assets/js/app/pages/admin/inbox.js:875 |
| INB-33 | حقل | (نص متغير) | public/assets/js/app/pages/admin/inbox.js:877 |
| INB-34 | زر | (نص متغير) | public/assets/js/app/pages/admin/inbox.js:896 |
| INB-35 | عنصر قائمة | مسح الفلاتر | public/assets/js/app/pages/admin/inbox.js:922 |
| INB-36 | عنصر قائمة | عرض النتائج | public/assets/js/app/pages/admin/inbox.js:923 |
| INB-37 | نافذة | تصفية | public/assets/js/app/pages/admin/inbox.js:925 |
| INB-38 | حقل | (نص متغير) | public/assets/js/app/pages/admin/inbox.js:952 |
| INB-39 | عنصر قائمة | كيف وصل الطلب؟ (القناة) | public/assets/js/app/pages/admin/inbox.js:973 |
| INB-40 | عنصر قائمة | segment | public/assets/js/app/pages/admin/inbox.js:975 |
| INB-41 | عنصر قائمة | اسم صاحب الطلب | public/assets/js/app/pages/admin/inbox.js:976 |
| INB-42 | عنصر قائمة | رقم الموبايل | public/assets/js/app/pages/admin/inbox.js:977 |
| INB-43 | عنصر قائمة | البريد الإلكتروني | public/assets/js/app/pages/admin/inbox.js:978 |
| INB-44 | عنصر قائمة | المحافظة | public/assets/js/app/pages/admin/inbox.js:979 |
| INB-45 | عنصر قائمة | كيف عرف بنا؟ (المصدر) | public/assets/js/app/pages/admin/inbox.js:980 |
| INB-46 | عنصر قائمة | الحملة أو جهة الإحالة | public/assets/js/app/pages/admin/inbox.js:981 |
| INB-47 | عنصر قائمة | وصف الطلب كما رواه صاحبه | public/assets/js/app/pages/admin/inbox.js:982 |
| INB-48 | نافذة | تسجيل طلب يدوي | public/assets/js/app/pages/admin/inbox.js:1012 |
| INB-49 | سؤال قابل للفتح | عن صندوق الوارد | public/assets/js/app/pages/admin/inbox.js:1030 |
| INB-50 | عنوان | عن صندوق الوارد | public/assets/js/app/pages/admin/inbox.js:1030 |
| INB-51 | زر | تحديث | public/assets/js/app/pages/admin/inbox.js:1047 |
| INB-52 | زر | تسجيل طلب يدوي | public/assets/js/app/pages/admin/inbox.js:1049 |
| INB-53 | عنوان | صندوق الوارد | public/assets/js/app/pages/admin/inbox.js:1051 |
| INB-54 | عنوان | صندوق الوارد | public/assets/js/app/pages/admin/inbox.js:1052 |

## RQT: صفحة الطلب الوارد (`/app#/inbox/`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| RQT-01 | زر | تغيير | public/assets/js/app/pages/admin/intake-detail.js:210 |
| RQT-02 | رابط | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:211 |
| RQT-03 | زر | إضافة كشركة عميلة | public/assets/js/app/pages/admin/intake-detail.js:245 |
| RQT-04 | عنوان | طلب عرض — تواصل تجاري | public/assets/js/app/pages/admin/intake-detail.js:246 |
| RQT-05 | قسم/بطاقة | طلب عرض — تواصل تجاري | public/assets/js/app/pages/admin/intake-detail.js:247 |
| RQT-06 | نافذة | تأكيد هوية المرسل | public/assets/js/app/pages/admin/intake-detail.js:257 |
| RQT-07 | نافذة | إلغاء روابط البوابة | public/assets/js/app/pages/admin/intake-detail.js:270 |
| RQT-08 | زر | تأكيد هوية المرسل | public/assets/js/app/pages/admin/intake-detail.js:289 |
| RQT-09 | زر | إلغاء روابط البوابة | public/assets/js/app/pages/admin/intake-detail.js:290 |
| RQT-10 | تنبيه | تنبيه: هوية المرسل غير مؤكدة | public/assets/js/app/pages/admin/intake-detail.js:294 |
| RQT-11 | زر | تأكيد هوية المرسل | public/assets/js/app/pages/admin/intake-detail.js:307 |
| RQT-12 | زر | فتح الملف | public/assets/js/app/pages/admin/intake-detail.js:327 |
| RQT-13 | تنبيه | تحوّل الطلب إلى ملف قانوني | public/assets/js/app/pages/admin/intake-detail.js:330 |
| RQT-14 | زر | إعادة فتح الطلب | public/assets/js/app/pages/admin/intake-detail.js:353 |
| RQT-15 | تنبيه | ملخص ما تم: | public/assets/js/app/pages/admin/intake-detail.js:356 |
| RQT-16 | زر | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:360 |
| RQT-17 | عنوان | ما القرار في هذا الطلب؟ | public/assets/js/app/pages/admin/intake-detail.js:372 |
| RQT-18 | قسم/بطاقة | ما القرار في هذا الطلب؟ | public/assets/js/app/pages/admin/intake-detail.js:373 |
| RQT-19 | نافذة | إعادة فتح الطلب | public/assets/js/app/pages/admin/intake-detail.js:382 |
| RQT-20 | عنصر قائمة | ملخص ما تم | public/assets/js/app/pages/admin/intake-detail.js:409 |
| RQT-21 | عنصر قائمة | المجال القانوني | public/assets/js/app/pages/admin/intake-detail.js:411 |
| RQT-22 | عنصر قائمة | قناة الرد | public/assets/js/app/pages/admin/intake-detail.js:412 |
| RQT-23 | عنصر قائمة | رد يُرسل | public/assets/js/app/pages/admin/intake-detail.js:413 |
| RQT-24 | نافذة | تعامل داخلي دون محامٍ | public/assets/js/app/pages/admin/intake-detail.js:422 |
| RQT-25 | عنصر قائمة | سبب الأرشفة | public/assets/js/app/pages/admin/intake-detail.js:435 |
| RQT-26 | نافذة | أرشفة الطلب | public/assets/js/app/pages/admin/intake-detail.js:437 |
| RQT-27 | زر | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:535 |
| RQT-28 | سؤال قابل للفتح | قرار يدوي | public/assets/js/app/pages/admin/intake-detail.js:538 |
| RQT-29 | عنوان | قرار يدوي | public/assets/js/app/pages/admin/intake-detail.js:539 |
| RQT-30 | رابط | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:571 |
| RQT-31 | زر | سجّل المكالمة | public/assets/js/app/pages/admin/intake-detail.js:578 |
| RQT-32 | زر | لم ترد | public/assets/js/app/pages/admin/intake-detail.js:585 |
| RQT-33 | زر | إغلاق: تعذّر الوصول إليها | public/assets/js/app/pages/admin/intake-detail.js:594 |
| RQT-34 | عنوان | طلبت مكالمة | public/assets/js/app/pages/admin/intake-detail.js:602 |
| RQT-35 | قسم/بطاقة | طلبت مكالمة | public/assets/js/app/pages/admin/intake-detail.js:603 |
| RQT-36 | زر | اسمع الرسالة الصوتية | public/assets/js/app/pages/admin/intake-detail.js:622 |
| RQT-37 | زر | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:623 |
| RQT-38 | زر | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:625 |
| RQT-39 | زر | إرسال لصفحته فقط | public/assets/js/app/pages/admin/intake-detail.js:627 |
| RQT-40 | زر | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:629 |
| RQT-41 | زر | حلّل الآن | public/assets/js/app/pages/admin/intake-detail.js:639 |
| RQT-42 | زر | اعمله طلب: … | public/assets/js/app/pages/admin/intake-detail.js:644 |
| RQT-43 | زر | اختيار مسار آخر | public/assets/js/app/pages/admin/intake-detail.js:647 |
| RQT-44 | زر | حدّث الملخص الآن | public/assets/js/app/pages/admin/intake-detail.js:648 |
| RQT-45 | عنوان | تحويل القصة إلى طلب | public/assets/js/app/pages/admin/intake-detail.js:683 |
| RQT-46 | قسم/بطاقة | تحويل القصة إلى طلب | public/assets/js/app/pages/admin/intake-detail.js:684 |
| RQT-47 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:707 |
| RQT-48 | قسم/بطاقة | اختيارات ضغطت عليها في الموقع (قد تكون غير دقيقة) | public/assets/js/app/pages/admin/intake-detail.js:708 |
| RQT-49 | زر | حدّث الآن | public/assets/js/app/pages/admin/intake-detail.js:734 |
| RQT-50 | حقل | اكتب مسألة قانونية أخرى… | public/assets/js/app/pages/admin/intake-detail.js:813 |
| RQT-51 | حقل | مجال المسألة الجديدة | public/assets/js/app/pages/admin/intake-detail.js:816 |
| RQT-52 | حقل | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:838 |
| RQT-53 | زر | حذف المسألة: | public/assets/js/app/pages/admin/intake-detail.js:863 |
| RQT-54 | زر | إضافة مسألة | public/assets/js/app/pages/admin/intake-detail.js:933 |
| RQT-55 | عنصر قائمة | إلغاء | public/assets/js/app/pages/admin/intake-detail.js:946 |
| RQT-56 | عنصر قائمة | تحويل وإصدار كود الملف | public/assets/js/app/pages/admin/intake-detail.js:993 |
| RQT-57 | نافذة | تحويل الطلب إلى ملف قانوني | public/assets/js/app/pages/admin/intake-detail.js:1002 |
| RQT-58 | زر | إعادة المحاولة | public/assets/js/app/pages/admin/intake-detail.js:1044 |
| RQT-59 | زر | فتح الطلب المذكور | public/assets/js/app/pages/admin/intake-detail.js:1099 |
| RQT-60 | زر | دمج بعد التحقق | public/assets/js/app/pages/admin/intake-detail.js:1100 |
| RQT-61 | تنبيه | يذكر رقم طلب ل | public/assets/js/app/pages/admin/intake-detail.js:1104 |
| RQT-62 | عنوان | المحادثة | public/assets/js/app/pages/admin/intake-detail.js:1116 |
| RQT-63 | قسم/بطاقة | المحادثة | public/assets/js/app/pages/admin/intake-detail.js:1117 |
| RQT-64 | عنصر قائمة | اسم المستند | public/assets/js/app/pages/admin/intake-detail.js:1131 |
| RQT-65 | نافذة | تسمية المستند | public/assets/js/app/pages/admin/intake-detail.js:1134 |
| RQT-66 | زر | تنزيل | public/assets/js/app/pages/admin/intake-detail.js:1183 |
| RQT-67 | زر | تسمية | public/assets/js/app/pages/admin/intake-detail.js:1184 |
| RQT-68 | عنوان | مستندات الطلب | public/assets/js/app/pages/admin/intake-detail.js:1191 |
| RQT-69 | قسم/بطاقة | مستندات الطلب | public/assets/js/app/pages/admin/intake-detail.js:1192 |
| RQT-70 | رابط | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:1202 |
| RQT-71 | حقل | اكتب ردك على … | public/assets/js/app/pages/admin/intake-detail.js:1205 |
| RQT-72 | حقل | الرد على … | public/assets/js/app/pages/admin/intake-detail.js:1208 |
| RQT-73 | حقل | قناة الإرسال | public/assets/js/app/pages/admin/intake-detail.js:1221 |
| RQT-74 | حقل | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:1222 |
| RQT-75 | زر | إرسال الرد | public/assets/js/app/pages/admin/intake-detail.js:1243 |
| RQT-76 | عنوان | بيانات الفرز | public/assets/js/app/pages/admin/intake-detail.js:1298 |
| RQT-77 | قسم/بطاقة | بيانات الفرز | public/assets/js/app/pages/admin/intake-detail.js:1299 |
| RQT-78 | زر | استخدام اقتراح الذكاء الاصطناعي في حقل | public/assets/js/app/pages/admin/intake-detail.js:1374 |
| RQT-79 | زر | يملأ الحقول الفارغة فقط من اقتراحات الذكاء الاصطناعي | public/assets/js/app/pages/admin/intake-detail.js:1398 |
| RQT-80 | عنوان | بيانات الفرز | public/assets/js/app/pages/admin/intake-detail.js:1408 |
| RQT-81 | قسم/بطاقة | بيانات الفرز | public/assets/js/app/pages/admin/intake-detail.js:1409 |
| RQT-82 | زر | صحيح | public/assets/js/app/pages/admin/intake-detail.js:1438 |
| RQT-83 | زر | غير دقيق | public/assets/js/app/pages/admin/intake-detail.js:1439 |
| RQT-84 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:1445 |
| RQT-85 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:1445 |
| RQT-86 | عنوان | تحليل الذكاء الاصطناعي | public/assets/js/app/pages/admin/intake-detail.js:1456 |
| RQT-87 | قسم/بطاقة | تحليل الذكاء الاصطناعي | public/assets/js/app/pages/admin/intake-detail.js:1457 |
| RQT-88 | زر | إعادة التحليل | public/assets/js/app/pages/admin/intake-detail.js:1467 |
| RQT-89 | حالة فارغة | لم يُحلَّل هذا الطلب بعد. يقترح التحليل عنوانًا وتصنيفًا وملخصًا والم… | public/assets/js/app/pages/admin/intake-detail.js:1474 |
| RQT-90 | عنوان | تحليل الذكاء الاصطناعي | public/assets/js/app/pages/admin/intake-detail.js:1475 |
| RQT-91 | قسم/بطاقة | تحليل الذكاء الاصطناعي | public/assets/js/app/pages/admin/intake-detail.js:1476 |
| RQT-92 | تنبيه | تعذر الوصول إلى النموذج اللغوي فاستُخدم المحلل المحلي: … | public/assets/js/app/pages/admin/intake-detail.js:1493 |
| RQT-93 | رابط | تشابه … | public/assets/js/app/pages/admin/intake-detail.js:1552 |
| RQT-94 | سؤال قابل للفتح | سجل تقييمات الإدارة لهذا التحليل (… ) | public/assets/js/app/pages/admin/intake-detail.js:1568 |
| RQT-95 | عنوان | سجل تقييمات الإدارة لهذا التحليل (… ) | public/assets/js/app/pages/admin/intake-detail.js:1568 |
| RQT-96 | عنوان | تحليل الذكاء الاصطناعي | public/assets/js/app/pages/admin/intake-detail.js:1587 |
| RQT-97 | قسم/بطاقة | تحليل الذكاء الاصطناعي | public/assets/js/app/pages/admin/intake-detail.js:1588 |
| RQT-98 | نافذة | تأكيد دمج الملفين | public/assets/js/app/pages/admin/intake-detail.js:1616 |
| RQT-99 | حالة فارغة | لا يوجد … مرتبط بهذا الطلب | public/assets/js/app/pages/admin/intake-detail.js:1628 |
| RQT-100 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:1628 |
| RQT-101 | قسم/بطاقة | لا يوجد … مرتبط بهذا الطلب | public/assets/js/app/pages/admin/intake-detail.js:1628 |
| RQT-102 | زر | ملف … | public/assets/js/app/pages/admin/intake-detail.js:1637 |
| RQT-103 | رابط | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:1641 |
| RQT-104 | زر | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:1643 |
| RQT-105 | عنوان | وسائل التواصل المرتبطة | public/assets/js/app/pages/admin/intake-detail.js:1670 |
| RQT-106 | عنوان | تاريخ … مع … | public/assets/js/app/pages/admin/intake-detail.js:1686 |
| RQT-107 | رابط | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:1691 |
| RQT-108 | رابط | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:1696 |
| RQT-109 | زر | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:1703 |
| RQT-110 | زر | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:1703 |
| RQT-111 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:1705 |
| RQT-112 | قسم/بطاقة | ملف … | public/assets/js/app/pages/admin/intake-detail.js:1706 |
| RQT-113 | عنوان | المصدر والقناة | public/assets/js/app/pages/admin/intake-detail.js:1734 |
| RQT-114 | قسم/بطاقة | المصدر والقناة | public/assets/js/app/pages/admin/intake-detail.js:1735 |
| RQT-115 | عنوان | سجل النشاط | public/assets/js/app/pages/admin/intake-detail.js:1752 |
| RQT-116 | قسم/بطاقة | سجل النشاط | public/assets/js/app/pages/admin/intake-detail.js:1752 |
| RQT-117 | عنصر قائمة | صندوق الوارد | public/assets/js/app/pages/admin/intake-detail.js:1810 |
| RQT-118 | زر | فتح الملف … | public/assets/js/app/pages/admin/intake-detail.js:1834 |
| RQT-119 | عنوان | الطلب | public/assets/js/app/pages/admin/intake-detail.js:1835 |
| RQT-120 | عنوان | الطلب | public/assets/js/app/pages/admin/intake-detail.js:1836 |
| RQT-121 | عنصر قائمة | المجال القانوني | public/assets/js/app/pages/admin/intake-detail.js:759 |
| RQT-122 | عنصر قائمة | عنوان الملف | public/assets/js/app/pages/admin/intake-detail.js:760 |
| RQT-123 | عنصر قائمة | الأولوية | public/assets/js/app/pages/admin/intake-detail.js:761 |
| RQT-124 | عنصر قائمة | الموعد المستهدف للرد على | public/assets/js/app/pages/admin/intake-detail.js:762 |
| RQT-125 | عنصر قائمة | مدير الحالة | public/assets/js/app/pages/admin/intake-detail.js:768 |
| RQT-126 | عنصر قائمة | ملخص الوقائع للمحامين | public/assets/js/app/pages/admin/intake-detail.js:777 |
| RQT-127 | عنصر قائمة | ملاحظات داخلية (لا تظهر للمحامين) | public/assets/js/app/pages/admin/intake-detail.js:779 |
| RQT-128 | نموذج | المجال القانوني | public/assets/js/app/pages/admin/intake-detail.js:791 |
| RQT-129 | عنصر قائمة | اسم | public/assets/js/app/pages/admin/intake-detail.js:797 |
| RQT-130 | عنصر قائمة | الرقم القومي | public/assets/js/app/pages/admin/intake-detail.js:798 |
| RQT-131 | عنصر قائمة | المحافظة | public/assets/js/app/pages/admin/intake-detail.js:799 |
| RQT-132 | نموذج | اسم … | public/assets/js/app/pages/admin/intake-detail.js:801 |
| RQT-133 | عنصر قائمة | موضوع الطلب | public/assets/js/app/pages/admin/intake-detail.js:1305 |
| RQT-134 | عنصر قائمة | المجال القانوني | public/assets/js/app/pages/admin/intake-detail.js:1306 |
| RQT-135 | عنصر قائمة | نوع الطلب | public/assets/js/app/pages/admin/intake-detail.js:1307 |
| RQT-136 | عنصر قائمة | الأولوية | public/assets/js/app/pages/admin/intake-detail.js:1308 |
| RQT-137 | عنصر قائمة | المسؤول عن الفرز | public/assets/js/app/pages/admin/intake-detail.js:1309 |
| RQT-138 | عنصر قائمة | مصدر | public/assets/js/app/pages/admin/intake-detail.js:1310 |
| RQT-139 | عنصر قائمة | الحملة / جهة الإحالة | public/assets/js/app/pages/admin/intake-detail.js:1311 |
| RQT-140 | عنصر قائمة | ملخص الطلب | public/assets/js/app/pages/admin/intake-detail.js:1312 |
| RQT-141 | عنصر قائمة | ملاحظات داخلية | public/assets/js/app/pages/admin/intake-detail.js:1313 |
| RQT-142 | زر | حفظ بيانات الفرز | public/assets/js/app/pages/admin/intake-detail.js:1345 |
| RQT-143 | نموذج | موضوع الطلب | public/assets/js/app/pages/admin/intake-detail.js:1346 |
| RQT-144 | عنصر | (نص متغير) | public/assets/js/app/pages/admin/intake-detail.js:1182 |

## PTH: نوع الطلب ومساره: الشريحة وسطر المسار والتعديل (`/app#/inbox`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| PTH-01 | نص | (نص متغير)<br>يظهر النص نفسه أيضًا في: T-02، S-12، W-01 (الزر الأول)، I-57 (الخيار الأول)، T-40، S-13، T-53، S-14 | public/assets/js/app/components/pathway-ui.js:37 |
| PTH-02 | نص | تعديل | public/assets/js/app/components/pathway-ui.js:96 |
| PTH-03 | زر | تعديل | public/assets/js/app/components/pathway-ui.js:101 |
| PTH-04 | نص | (نص متغير) | public/assets/js/app/components/pathway-ui.js:44 |
| PTH-05 | نص | نوع الطلب: … ؟ | public/assets/js/app/components/pathway-ui.js:56 |
| PTH-06 | زر | تأكيد نوع الطلب: … | public/assets/js/app/components/pathway-ui.js:62 |
| PTH-07 | قسم/بطاقة | نوع الطلب | public/assets/js/app/components/pathway-ui.js:186 |
| PTH-08 | حقل | (نص متغير) | public/assets/js/app/components/pathway-ui.js:137 |
| PTH-09 | حقل | (نص متغير) | public/assets/js/app/components/pathway-ui.js:167 |
| PTH-10 | حقل | (نص متغير) | public/assets/js/app/components/pathway-ui.js:157 |
| PTH-11 | حقل | (نص متغير) | public/assets/js/app/components/pathway-ui.js:145 |
| PTH-12 | عنصر | (نص متغير) | public/assets/js/app/components/pathway-ui.js:222 |
| PTH-13 | عنصر | (نص متغير) | public/assets/js/app/components/pathway-ui.js:221 |
| PTH-14 | نص | (نص متغير) | public/assets/js/app/components/pathway-ui.js:146 |
| PTH-15 | زر | إلغاء الإيقاف | public/assets/js/app/pages/admin/intake-detail.js:1800 |
| PTH-16 | عنصر قائمة | إلغاء | public/assets/js/app/components/pathway-ui.js:196 |
| PTH-17 | عنصر قائمة | حفظ | public/assets/js/app/components/pathway-ui.js:216 |
| PTH-18 | نافذة | نوع الطلب | public/assets/js/app/components/pathway-ui.js:183 |

## STY: ورقة «اعمله طلب» (`/app#/inbox/`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| STY-01 | سؤال قابل للفتح | تغيير نوع الخدمة عند اعتماد القرار | public/assets/js/app/components/story-sheet.js:205 |
| STY-02 | عنوان | تغيير نوع الخدمة عند اعتماد القرار | public/assets/js/app/components/story-sheet.js:205 |
| STY-03 | خيار | المسار | public/assets/js/app/components/story-sheet.js:240 |
| STY-04 | زر | اتصل به | public/assets/js/app/components/story-sheet.js:277 |
| STY-05 | حقل | اكتب مسألة قانونية أخرى… | public/assets/js/app/components/story-sheet.js:297 |
| STY-06 | حقل | (نص متغير) | public/assets/js/app/components/story-sheet.js:313 |
| STY-07 | زر | حذف المسألة: | public/assets/js/app/components/story-sheet.js:334 |
| STY-08 | زر | إضافة مسألة | public/assets/js/app/components/story-sheet.js:374 |
| STY-09 | حقل | (نص متغير) | public/assets/js/app/components/story-sheet.js:384 |
| STY-10 | حقل | (نص متغير) | public/assets/js/app/components/story-sheet.js:389 |
| STY-11 | حقل | (نص متغير) | public/assets/js/app/components/story-sheet.js:390 |
| STY-12 | سؤال قابل للفتح | بيانات المستفيدة والتمويل | public/assets/js/app/components/story-sheet.js:536 |
| STY-13 | عنوان | بيانات المستفيدة والتمويل | public/assets/js/app/components/story-sheet.js:536 |
| STY-14 | زر | إضافة سؤال | public/assets/js/app/components/story-sheet.js:688 |
| STY-15 | حقل | (نص متغير) | public/assets/js/app/components/story-sheet.js:690 |
| STY-16 | زر | رجّعها للنص التلقائي | public/assets/js/app/components/story-sheet.js:699 |
| STY-17 | حقل | الرسالة كما ستصلها | public/assets/js/app/components/story-sheet.js:702 |
| STY-18 | حقل | السؤال … | public/assets/js/app/components/story-sheet.js:731 |
| STY-19 | زر | حذف السؤال | public/assets/js/app/components/story-sheet.js:750 |
| STY-20 | زر | متابعة رغم ذلك | public/assets/js/app/components/story-sheet.js:836 |
| STY-21 | زر | مراجعة الرسائل | public/assets/js/app/components/story-sheet.js:854 |
| STY-22 | تنبيه | وصلت رسائل جديدة من المستفيدة بعد فتح الاقتراح. راجعها ثم حاول مرة أخ… | public/assets/js/app/components/story-sheet.js:860 |
| STY-23 | تنبيه | (نص متغير) | public/assets/js/app/components/story-sheet.js:869 |
| STY-24 | تنبيه | (نص متغير) | public/assets/js/app/components/story-sheet.js:874 |
| STY-25 | نافذة | اعمله طلب | public/assets/js/app/components/story-sheet.js:961 |
| STY-26 | عنصر قائمة | عنوان الملف | public/assets/js/app/components/story-sheet.js:436 |
| STY-27 | عنصر قائمة | الأولوية | public/assets/js/app/components/story-sheet.js:437 |
| STY-28 | عنصر قائمة | مدير الحالة | public/assets/js/app/components/story-sheet.js:438 |
| STY-29 | عنصر قائمة | الموعد المستهدف للرد على | public/assets/js/app/components/story-sheet.js:439 |
| STY-30 | عنصر قائمة | ملخص الوقائع للمحامين | public/assets/js/app/components/story-sheet.js:447 |
| STY-31 | عنصر قائمة | سؤال المحامي المقترح | public/assets/js/app/components/story-sheet.js:456 |
| STY-32 | عنصر قائمة | ملاحظات داخلية (لا تظهر للمحامين) | public/assets/js/app/components/story-sheet.js:458 |
| STY-33 | نموذج | عنوان الملف | public/assets/js/app/components/story-sheet.js:471 |
| STY-34 | عنصر قائمة | نوع الملف | public/assets/js/app/components/story-sheet.js:481 |
| STY-35 | عنصر قائمة | المحكمة | public/assets/js/app/components/story-sheet.js:482 |
| STY-36 | عنصر قائمة | الخصم | public/assets/js/app/components/story-sheet.js:483 |
| STY-37 | عنصر قائمة | رقم الدعوى | public/assets/js/app/components/story-sheet.js:484 |
| STY-38 | عنصر قائمة | السنة | public/assets/js/app/components/story-sheet.js:485 |
| STY-39 | عنصر قائمة | المحامي المسؤول | public/assets/js/app/components/story-sheet.js:486 |
| STY-40 | عنصر قائمة | ملاحظات وتكليف المحامي | public/assets/js/app/components/story-sheet.js:487 |
| STY-41 | نموذج | نوع الملف | public/assets/js/app/components/story-sheet.js:489 |
| STY-42 | عنصر قائمة | اسم | public/assets/js/app/components/story-sheet.js:511 |
| STY-43 | عنصر قائمة | الرقم القومي | public/assets/js/app/components/story-sheet.js:512 |
| STY-44 | عنصر قائمة | المحافظة | public/assets/js/app/components/story-sheet.js:513 |
| STY-45 | نموذج | اسم … | public/assets/js/app/components/story-sheet.js:515 |
| STY-46 | نموذج | (نص متغير) | public/assets/js/app/components/story-sheet.js:628 |
| STY-47 | نموذج | (نص متغير) | public/assets/js/app/components/story-sheet.js:707 |
| STY-48 | عنصر قائمة | الجهة | public/assets/js/app/components/story-sheet.js:610 |
| STY-49 | عنصر قائمة | ملخص ما تم (داخلي) | public/assets/js/app/components/story-sheet.js:612 |
| STY-50 | عنصر قائمة | ملخص ما تم (داخلي) | public/assets/js/app/components/story-sheet.js:617 |
| STY-51 | خيار | المجال القانوني | public/assets/js/app/components/story-sheet.js:283 |
| STY-52 | خيار | قناة الرد | public/assets/js/app/components/story-sheet.js:291 |
| STY-53 | عنصر قائمة | إلغاء | public/assets/js/app/components/story-sheet.js:906 |
| STY-54 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/story-sheet.js:907 |
| STY-55 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/story-sheet.js:922 |
| STY-56 | رسالة | tag | public/assets/js/app/components/story-sheet.js:49 |
| STY-57 | رسالة | tag | public/assets/js/app/components/story-sheet.js:50 |
| STY-58 | رسالة | tag | public/assets/js/app/components/story-sheet.js:51 |
| STY-59 | رسالة | tag | public/assets/js/app/components/story-sheet.js:52 |
| STY-60 | رسالة | tag | public/assets/js/app/components/story-sheet.js:53 |

## CNT: تسجيل المكالمة (يظهر في: نافذة «تسجيل المكالمة» في صفحة الطلب)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CNT-01 | حقل | (نص متغير) | public/assets/js/app/components/call-note.js:56 |
| CNT-02 | حقل | ما قالته المستفيدة في المكالمة | public/assets/js/app/components/call-note.js:57 |
| CNT-03 | حقل | (نص متغير) | public/assets/js/app/components/call-note.js:58 |
| CNT-04 | نافذة | تجاهل ما كتبته؟ | public/assets/js/app/components/call-note.js:87 |
| CNT-05 | عنصر قائمة | إلغاء | public/assets/js/app/components/call-note.js:91 |
| CNT-06 | عنصر قائمة | حفظ وتلخيص | public/assets/js/app/components/call-note.js:112 |
| CNT-07 | نافذة | تسجيل المكالمة | public/assets/js/app/components/call-note.js:116 |
| CNT-08 | زر | سُجّلت محاولة الاتصال: … | public/assets/js/app/components/call-note.js:156 |
| CNT-09 | نافذة | لم ترد — ماذا حدث؟ | public/assets/js/app/components/call-note.js:166 |
| CNT-10 | نافذة | إغلاق: تعذّر الوصول إليها | public/assets/js/app/components/call-note.js:200 |
| CNT-11 | رابط | (نص متغير) | public/assets/js/app/components/call-note.js:211 |
| CNT-12 | تنبيه | اتصل على | public/assets/js/app/components/call-note.js:213 |

## SPL: فصل رسالة إلى طلب جديد (يظهر في: نافذة «اعمل منها طلبًا جديدًا» في المحادثة)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| SPL-01 | حقل | يمكن نقل … رسالة على الأكثر في المرة الواحدة | public/assets/js/app/components/split-dialog.js:52 |
| SPL-02 | عنصر قائمة | إلغاء | public/assets/js/app/components/split-dialog.js:92 |
| SPL-03 | عنصر قائمة | اعمل طلب جديد | public/assets/js/app/components/split-dialog.js:108 |
| SPL-04 | نافذة | طلب جديد من رسائل هذا الملف | public/assets/js/app/components/split-dialog.js:118 |

## SEG: نوع الخدمة: الشرائح والمفتاح وورقة التغيير (يظهر في: شرائح نوع الخدمة ونافذة تغييره في الطلبات والملفات)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| SEG-01 | زر | (نص متغير) | public/assets/js/app/components/segment-ui.js:234 |
| SEG-02 | زر | (نص متغير) | public/assets/js/app/components/segment-ui.js:300 |
| SEG-03 | حقل | (نص متغير) | public/assets/js/app/components/segment-ui.js:344 |
| SEG-04 | حقل | اختاروا النوع قبل الإرسال — لا يوجد اختيار افتراضي. | public/assets/js/app/components/segment-ui.js:354 |
| SEG-05 | حقل | (نص متغير) | public/assets/js/app/components/segment-ui.js:384 |
| SEG-06 | حقل | (نص متغير) | public/assets/js/app/components/segment-ui.js:394 |
| SEG-07 | حقل | (نص متغير) | public/assets/js/app/components/segment-ui.js:402 |
| SEG-08 | زر | (نص متغير) | public/assets/js/app/components/segment-ui.js:427 |
| SEG-09 | حقل | السبب | public/assets/js/app/components/segment-ui.js:433 |
| SEG-10 | حقل | (نص متغير) | public/assets/js/app/components/segment-ui.js:436 |
| SEG-11 | حقل | (نص متغير) | public/assets/js/app/components/segment-ui.js:437 |
| SEG-12 | حقل | نص الرسالة | public/assets/js/app/components/segment-ui.js:448 |
| SEG-13 | عنصر قائمة | إلغاء | public/assets/js/app/components/segment-ui.js:538 |
| SEG-14 | عنصر قائمة | حفظ | public/assets/js/app/components/segment-ui.js:554 |
| SEG-15 | نافذة | نوع الخدمة لهذا الملف | public/assets/js/app/components/segment-ui.js:563 |
| SEG-16 | زر | (نص متغير) | public/assets/js/app/components/segment-ui.js:597 |
| SEG-17 | زر | استخدم الاقتراح | public/assets/js/app/components/segment-ui.js:606 |
| SEG-18 | قسم/بطاقة | نوع الخدمة غير محدد | public/assets/js/app/components/segment-ui.js:614 |
| SEG-19 | عنوان | نوع الخدمة غير محدد | public/assets/js/app/components/segment-ui.js:615 |
| SEG-20 | حقل | (نص متغير) | public/assets/js/app/components/segment-ui.js:627 |
| SEG-21 | حقل | أتعاب استشارة قانونية | public/assets/js/app/components/segment-ui.js:628 |
| SEG-22 | حقل | (نص متغير) | public/assets/js/app/components/segment-ui.js:629 |
| SEG-23 | حقل | المبلغ | public/assets/js/app/components/segment-ui.js:630 |
| SEG-24 | حقل | الوصف | public/assets/js/app/components/segment-ui.js:631 |
| SEG-25 | حقل | تاريخ الاستحقاق | public/assets/js/app/components/segment-ui.js:632 |
| SEG-26 | عنصر قائمة | إلغاء | public/assets/js/app/components/segment-ui.js:680 |
| SEG-27 | عنصر قائمة | إرسال للعميل للموافقة | public/assets/js/app/components/segment-ui.js:697 |
| SEG-28 | نافذة | إضافة أتعاب لهذا الملف | public/assets/js/app/components/segment-ui.js:705 |

## QUE: بانتظار قرار الإدارة (`/app#/queue`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| QUE-01 | رابط | (نص متغير) | public/assets/js/app/pages/admin/queue.js:42 |
| QUE-02 | رابط | (نص متغير) | public/assets/js/app/pages/admin/queue.js:52 |
| QUE-03 | عنصر قائمة | سؤال المحامي ( | public/assets/js/app/pages/admin/queue.js:81 |
| QUE-04 | عنصر قائمة | نص الرسالة للشركة | public/assets/js/app/pages/admin/queue.js:82 |
| QUE-05 | نافذة | موافقة وإرسال للشركة | public/assets/js/app/pages/admin/queue.js:85 |
| QUE-06 | عنصر قائمة | سؤال المحامي ( | public/assets/js/app/pages/admin/queue.js:100 |
| QUE-07 | عنصر قائمة | نص الرسالة للمستفيد/ة | public/assets/js/app/pages/admin/queue.js:101 |
| QUE-08 | عنصر قائمة | قناة الإرسال | public/assets/js/app/pages/admin/queue.js:102 |
| QUE-09 | نافذة | موافقة وإرسال للمستفيد/ة | public/assets/js/app/pages/admin/queue.js:105 |
| QUE-10 | عنصر قائمة | طلب المحامي ( | public/assets/js/app/pages/admin/queue.js:124 |
| QUE-11 | عنصر قائمة | تمديد الموعد إلى | public/assets/js/app/pages/admin/queue.js:125 |
| QUE-12 | عنصر قائمة | الرد الذي سيراه المحامي | public/assets/js/app/pages/admin/queue.js:126 |
| QUE-13 | نافذة | الرد على طلب المهلة | public/assets/js/app/pages/admin/queue.js:129 |
| QUE-14 | عنصر قائمة | سبب الرفض (يراه المحامي) | public/assets/js/app/pages/admin/queue.js:142 |
| QUE-15 | نافذة | رفض طلب المعلومات | public/assets/js/app/pages/admin/queue.js:144 |
| QUE-16 | عنصر قائمة | المطلوب من | public/assets/js/app/pages/admin/queue.js:169 |
| QUE-17 | عنصر قائمة | الرد الذي سيراه المحامي | public/assets/js/app/pages/admin/queue.js:170 |
| QUE-18 | عنصر قائمة | مرفقات | public/assets/js/app/pages/admin/queue.js:177 |
| QUE-19 | نافذة | إتاحة رد الشركة للمحامي | public/assets/js/app/pages/admin/queue.js:186 |
| QUE-20 | عنصر قائمة | سبب الرفض (يراه المحامي) | public/assets/js/app/pages/admin/queue.js:198 |
| QUE-21 | نافذة | رفض طلب المساعدة | public/assets/js/app/pages/admin/queue.js:200 |
| QUE-22 | زر | الرد على طلب المهلة | public/assets/js/app/pages/admin/queue.js:237 |
| QUE-23 | زر | موافقة وإرسال | public/assets/js/app/pages/admin/queue.js:238 |
| QUE-24 | زر | رفض | public/assets/js/app/pages/admin/queue.js:239 |
| QUE-25 | رابط | تنزيل … | public/assets/js/app/pages/admin/queue.js:264 |
| QUE-26 | زر | إتاحة للمحامي | public/assets/js/app/pages/admin/queue.js:282 |
| QUE-27 | زر | فتح الملف لإرفاق المستندات | public/assets/js/app/pages/admin/queue.js:283 |
| QUE-28 | زر | مراجعة وإتاحة من الملف | public/assets/js/app/pages/admin/queue.js:287 |
| QUE-29 | زر | اختيار المحامي وتحديد الصلاحيات | public/assets/js/app/pages/admin/queue.js:319 |
| QUE-30 | زر | رفض | public/assets/js/app/pages/admin/queue.js:320 |
| QUE-31 | عنصر قائمة | الملف | public/assets/js/app/pages/admin/queue.js:336 |
| QUE-32 | عنصر قائمة | المحامي | public/assets/js/app/pages/admin/queue.js:337 |
| QUE-33 | عنصر قائمة | الدور في الفريق | public/assets/js/app/pages/admin/queue.js:338 |
| QUE-34 | عنصر قائمة | النسخة | public/assets/js/app/pages/admin/queue.js:339 |
| QUE-35 | عنصر قائمة | قُدِّم | public/assets/js/app/pages/admin/queue.js:340 |
| QUE-36 | زر | مراجعة الرأي | public/assets/js/app/pages/admin/queue.js:341 |
| QUE-37 | عنصر قائمة | مراجعة الرأي | public/assets/js/app/pages/admin/queue.js:341 |
| QUE-38 | جدول | آراء بانتظار المراجعة | public/assets/js/app/pages/admin/queue.js:344 |
| QUE-39 | جدول | آراء بانتظار المراجعة | public/assets/js/app/pages/admin/queue.js:345 |
| QUE-40 | زر | اعتماد | public/assets/js/app/pages/admin/queue.js:364 |
| QUE-41 | نافذة | استبعاد المسألة | public/assets/js/app/pages/admin/queue.js:374 |
| QUE-42 | زر | استبعاد | public/assets/js/app/pages/admin/queue.js:378 |
| QUE-43 | زر | إعداد الرد للمستفيد/ة | public/assets/js/app/pages/admin/queue.js:395 |
| QUE-44 | عنصر قائمة | الملف | public/assets/js/app/pages/admin/queue.js:411 |
| QUE-45 | عنصر قائمة | المحامي | public/assets/js/app/pages/admin/queue.js:412 |
| QUE-46 | عنصر قائمة | الدور | public/assets/js/app/pages/admin/queue.js:413 |
| QUE-47 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/queue.js:414 |
| QUE-48 | عنصر قائمة | الموعد | public/assets/js/app/pages/admin/queue.js:415 |
| QUE-49 | جدول | إسنادات متأخرة | public/assets/js/app/pages/admin/queue.js:418 |
| QUE-50 | جدول | إسنادات متأخرة | public/assets/js/app/pages/admin/queue.js:419 |
| QUE-51 | زر | التحقق من الهوية | public/assets/js/app/pages/admin/queue.js:435 |
| QUE-52 | قسم/بطاقة | لا يوجد | public/assets/js/app/pages/admin/queue.js:468 |
| QUE-53 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/queue.js:471 |
| QUE-54 | حالة فارغة | (نص متغير) | public/assets/js/app/pages/admin/queue.js:482 |
| QUE-55 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/queue.js:483 |
| QUE-56 | قسم/بطاقة | العدد: … | public/assets/js/app/pages/admin/queue.js:484 |
| QUE-57 | قائمة روابط | أقسام قائمة القرارات | public/assets/js/app/pages/admin/queue.js:502 |
| QUE-58 | زر | (نص متغير) | public/assets/js/app/pages/admin/queue.js:507 |
| QUE-59 | عنصر قائمة | لوحة المتابعة | public/assets/js/app/pages/admin/queue.js:523 |
| QUE-60 | زر | تحديث | public/assets/js/app/pages/admin/queue.js:525 |
| QUE-61 | عنوان | بانتظار قرار الإدارة | public/assets/js/app/pages/admin/queue.js:526 |
| QUE-62 | عنوان | بانتظار قرار الإدارة | public/assets/js/app/pages/admin/queue.js:527 |
| QUE-63 | تنبيه | كل شيء محدَّث | public/assets/js/app/pages/admin/queue.js:529 |

## CSL: ملفات الاستشارات (`/app#/cases`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CSL-01 | بطاقة رقم | ملفات مفتوحة | public/assets/js/app/pages/admin/cases.js:135 |
| CSL-02 | بطاقة رقم | بحاجة إلى قرار الإدارة | public/assets/js/app/pages/admin/cases.js:136 |
| CSL-03 | بطاقة رقم | ملفات بها إسنادات متأخرة | public/assets/js/app/pages/admin/cases.js:137 |
| CSL-04 | بطاقة رقم | رسائل جديدة من المستفيدين | public/assets/js/app/pages/admin/cases.js:138 |
| CSL-05 | زر | (نص متغير) | public/assets/js/app/pages/admin/cases.js:155 |
| CSL-06 | رابط | فتح الملف … | public/assets/js/app/pages/admin/cases.js:186 |
| CSL-07 | تنبيه | يُعرض أحدث 500 ملف فقط. استخدم البحث أو الفلاتر لتضييق النتائج. | public/assets/js/app/pages/admin/cases.js:257 |
| CSL-08 | قسم/بطاقة | جدول ملفات الاستشارات | public/assets/js/app/pages/admin/cases.js:260 |
| CSL-09 | جدول | جدول ملفات الاستشارات | public/assets/js/app/pages/admin/cases.js:270 |
| CSL-10 | جدول | جدول ملفات الاستشارات | public/assets/js/app/pages/admin/cases.js:271 |
| CSL-11 | زر | مسح الفلاتر | public/assets/js/app/pages/admin/cases.js:300 |
| CSL-12 | حقل | بحث في الملفات | public/assets/js/app/pages/admin/cases.js:304 |
| CSL-13 | حقل | المجال القانوني | public/assets/js/app/pages/admin/cases.js:305 |
| CSL-14 | حقل | الأولوية | public/assets/js/app/pages/admin/cases.js:306 |
| CSL-15 | حقل | مدير الحالة | public/assets/js/app/pages/admin/cases.js:308 |
| CSL-16 | حقل | المحامي في الفريق | public/assets/js/app/pages/admin/cases.js:310 |
| CSL-17 | عنصر قائمة | لوحة المتابعة | public/assets/js/app/pages/admin/cases.js:317 |
| CSL-18 | زر | بانتظار قرار الإدارة | public/assets/js/app/pages/admin/cases.js:319 |
| CSL-19 | زر | صندوق الوارد | public/assets/js/app/pages/admin/cases.js:320 |
| CSL-20 | عنوان | ملفات الاستشارات | public/assets/js/app/pages/admin/cases.js:322 |
| CSL-21 | عنوان | ملفات الاستشارات | public/assets/js/app/pages/admin/cases.js:323 |

## CSF: ملف استشارة (كل التبويبات) (`/app#/cases/`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CSF-01 | عنصر قائمة | إلغاء | public/assets/js/app/pages/admin/case-detail.js:102 |
| CSF-02 | عنصر قائمة | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:103 |
| CSF-03 | نافذة | إلغاء | public/assets/js/app/pages/admin/case-detail.js:106 |
| CSF-04 | عنصر قائمة | إلغاء | public/assets/js/app/pages/admin/case-detail.js:124 |
| CSF-05 | عنصر قائمة | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:131 |
| CSF-06 | نافذة | هل أنت متأكد من تنفيذ هذا الإجراء؟ | public/assets/js/app/pages/admin/case-detail.js:135 |
| CSF-07 | زر | إعادة المحاولة | public/assets/js/app/pages/admin/case-detail.js:187 |
| CSF-08 | زر | اعمل منها طلب جديد | public/assets/js/app/pages/admin/case-detail.js:193 |
| CSF-09 | حقل | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:259 |
| CSF-10 | حقل | قناة الإرسال | public/assets/js/app/pages/admin/case-detail.js:264 |
| CSF-11 | زر | إرسال | public/assets/js/app/pages/admin/case-detail.js:283 |
| CSF-12 | سؤال قابل للفتح | مستند | public/assets/js/app/pages/admin/case-detail.js:394 |
| CSF-13 | عنوان | مستند | public/assets/js/app/pages/admin/case-detail.js:397 |
| CSF-14 | عنوان | نتائج تحليل المستندات | public/assets/js/app/pages/admin/case-detail.js:407 |
| CSF-15 | قسم/بطاقة | نتائج تحليل المستندات | public/assets/js/app/pages/admin/case-detail.js:408 |
| CSF-16 | زر | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:474 |
| CSF-17 | حقل | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:503 |
| CSF-18 | حقل | مثال: صورة إعلام الوراثة | public/assets/js/app/pages/admin/case-detail.js:504 |
| CSF-19 | حقل | عنوان المستند (اختياري) | public/assets/js/app/pages/admin/case-detail.js:505 |
| CSF-20 | زر | رفع المستندات | public/assets/js/app/pages/admin/case-detail.js:519 |
| CSF-21 | زر | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:664 |
| CSF-22 | رابط | فتح طلب الشركة | public/assets/js/app/pages/admin/case-detail.js:665 |
| CSF-23 | زر | فتح طلب الشركة | public/assets/js/app/pages/admin/case-detail.js:716 |
| CSF-24 | زر | رسالة … | public/assets/js/app/pages/admin/case-detail.js:721 |
| CSF-25 | زر | فتح الملف المستمر | public/assets/js/app/pages/admin/case-detail.js:722 |
| CSF-26 | زر | تحويل إلى ملف مستمر | public/assets/js/app/pages/admin/case-detail.js:731 |
| CSF-27 | زر | إعادة فتح الملف | public/assets/js/app/pages/admin/case-detail.js:736 |
| CSF-28 | زر | إغلاق الملف | public/assets/js/app/pages/admin/case-detail.js:737 |
| CSF-29 | زر | تغيير | public/assets/js/app/pages/admin/case-detail.js:765 |
| CSF-30 | عنصر قائمة | ملفات الاستشارات | public/assets/js/app/pages/admin/case-detail.js:775 |
| CSF-31 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:787 |
| CSF-32 | عنوان | ملفات الاستشارات | public/assets/js/app/pages/admin/case-detail.js:788 |
| CSF-33 | تنبيه | الملف مغلق | public/assets/js/app/pages/admin/case-detail.js:795 |
| CSF-34 | تنبيه | الملف مغلق | public/assets/js/app/pages/admin/case-detail.js:805 |
| CSF-35 | قسم/بطاقة | ما يحتاج إلى قرار الإدارة في هذا الملف | public/assets/js/app/pages/admin/case-detail.js:829 |
| CSF-36 | زر | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:838 |
| CSF-37 | رابط | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:859 |
| CSF-38 | رابط | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:860 |
| CSF-39 | عنوان | الشركة | public/assets/js/app/pages/admin/case-detail.js:863 |
| CSF-40 | قسم/بطاقة | الشركة | public/assets/js/app/pages/admin/case-detail.js:864 |
| CSF-41 | رابط | بدون اسم | public/assets/js/app/pages/admin/case-detail.js:872 |
| CSF-42 | زر | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:873 |
| CSF-43 | رابط | فتح الطلب الوارد … | public/assets/js/app/pages/admin/case-detail.js:878 |
| CSF-44 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:881 |
| CSF-45 | قسم/بطاقة | … ومصدره | public/assets/js/app/pages/admin/case-detail.js:882 |
| CSF-46 | زر | تعديل البيانات | public/assets/js/app/pages/admin/case-detail.js:889 |
| CSF-47 | رابط | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:894 |
| CSF-48 | رابط | السجل المعرفي #… | public/assets/js/app/pages/admin/case-detail.js:900 |
| CSF-49 | عنوان | متابعة الملف | public/assets/js/app/pages/admin/case-detail.js:913 |
| CSF-50 | قسم/بطاقة | متابعة الملف | public/assets/js/app/pages/admin/case-detail.js:914 |
| CSF-51 | زر | تعديل | public/assets/js/app/pages/admin/case-detail.js:928 |
| CSF-52 | حالة فارغة | لم تُسجَّل وقائع داخلية بعد | public/assets/js/app/pages/admin/case-detail.js:935 |
| CSF-53 | حقل | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:942 |
| CSF-54 | زر | حفظ | public/assets/js/app/pages/admin/case-detail.js:949 |
| CSF-55 | تنبيه | لا تكتب في الملخص رقم الهاتف أو العنوان أو أي بيانات تواصل. سيُبلَّغ… | public/assets/js/app/pages/admin/case-detail.js:956 |
| CSF-56 | زر | إلغاء | public/assets/js/app/pages/admin/case-detail.js:957 |
| CSF-57 | قسم/بطاقة | يظهر فقط لأعضاء الفريق الممنوحين صلاحية «ملخص الوقائع» | public/assets/js/app/pages/admin/case-detail.js:979 |
| CSF-58 | زر | اعتماد المسألة | public/assets/js/app/pages/admin/case-detail.js:1006 |
| CSF-59 | زر | تعديل | public/assets/js/app/pages/admin/case-detail.js:1011 |
| CSF-60 | زر | عدم الاعتماد | public/assets/js/app/pages/admin/case-detail.js:1025 |
| CSF-61 | زر | إعادة تفعيل | public/assets/js/app/pages/admin/case-detail.js:1036 |
| CSF-62 | زر | إضافة | public/assets/js/app/pages/admin/case-detail.js:1105 |
| CSF-63 | زر | اقتراح مسائل بالذكاء الاصطناعي | public/assets/js/app/pages/admin/case-detail.js:1124 |
| CSF-64 | زر | إضافة مسألة | public/assets/js/app/pages/admin/case-detail.js:1126 |
| CSF-65 | حالة فارغة | لا توجد مسائل معتمدة بعد. أضف المسائل التي يجب أن يجيب عنها الفريق. | public/assets/js/app/pages/admin/case-detail.js:1138 |
| CSF-66 | سؤال قابل للفتح | المسائل المستبعدة (… ) | public/assets/js/app/pages/admin/case-detail.js:1141 |
| CSF-67 | عنوان | المسائل المستبعدة (… ) | public/assets/js/app/pages/admin/case-detail.js:1141 |
| CSF-68 | عنوان | المسائل القانونية | public/assets/js/app/pages/admin/case-detail.js:1143 |
| CSF-69 | قسم/بطاقة | المسائل القانونية | public/assets/js/app/pages/admin/case-detail.js:1144 |
| CSF-70 | حالة فارغة | لا يوجد تحليل آلي للطلب الأصلي | public/assets/js/app/pages/admin/case-detail.js:1151 |
| CSF-71 | عنوان | تحليل الذكاء الاصطناعي للطلب | public/assets/js/app/pages/admin/case-detail.js:1151 |
| CSF-72 | قسم/بطاقة | تحليل الذكاء الاصطناعي للطلب | public/assets/js/app/pages/admin/case-detail.js:1151 |
| CSF-73 | تنبيه | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:1176 |
| CSF-74 | زر | اطلب من … | public/assets/js/app/pages/admin/case-detail.js:1193 |
| CSF-75 | عنوان | تحليل الذكاء الاصطناعي للطلب | public/assets/js/app/pages/admin/case-detail.js:1201 |
| CSF-76 | قسم/بطاقة | تحليل الذكاء الاصطناعي للطلب | public/assets/js/app/pages/admin/case-detail.js:1202 |
| CSF-77 | رابط | مادة معرفية | public/assets/js/app/pages/admin/case-detail.js:1221 |
| CSF-78 | حالة فارغة | لا توجد حالات مشابهة بالقدر الكافي | public/assets/js/app/pages/admin/case-detail.js:1234 |
| CSF-79 | عنوان | حالات مشابهة تعاملنا معها | public/assets/js/app/pages/admin/case-detail.js:1235 |
| CSF-80 | قسم/بطاقة | حالات مشابهة تعاملنا معها | public/assets/js/app/pages/admin/case-detail.js:1236 |
| CSF-81 | زر | إضافة أتعاب | public/assets/js/app/pages/admin/case-detail.js:1296 |
| CSF-82 | عنوان | الأتعاب | public/assets/js/app/pages/admin/case-detail.js:1298 |
| CSF-83 | قسم/بطاقة | الأتعاب | public/assets/js/app/pages/admin/case-detail.js:1299 |
| CSF-84 | حقل | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:1325 |
| CSF-85 | حقل | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:1326 |
| CSF-86 | زر | تحديد الكل | public/assets/js/app/pages/admin/case-detail.js:1350 |
| CSF-87 | زر | إلغاء التحديد | public/assets/js/app/pages/admin/case-detail.js:1359 |
| CSF-88 | حقل | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:1371 |
| CSF-89 | زر | تعديل الصلاحيات | public/assets/js/app/pages/admin/case-detail.js:1565 |
| CSF-90 | زر | تعديل الإسناد | public/assets/js/app/pages/admin/case-detail.js:1566 |
| CSF-91 | زر | إعادة فتح الإسناد للمحامي | public/assets/js/app/pages/admin/case-detail.js:1567 |
| CSF-92 | زر | سحب الإسناد | public/assets/js/app/pages/admin/case-detail.js:1568 |
| CSF-93 | رابط | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:1579 |
| CSF-94 | تنبيه | ما تراه الإدارة ليس بالضرورة ما يراه المحامي: كل عضو يرى فقط ما منحته… | public/assets/js/app/pages/admin/case-detail.js:1619 |
| CSF-95 | زر | إسناد محامٍ | public/assets/js/app/pages/admin/case-detail.js:1621 |
| CSF-96 | زر | إسناد محامٍ | public/assets/js/app/pages/admin/case-detail.js:1625 |
| CSF-97 | حالة فارغة | لم يُسند الملف لأي محامٍ بعد | public/assets/js/app/pages/admin/case-detail.js:1625 |
| CSF-98 | سؤال قابل للفتح | إسنادات مسحوبة (… ) | public/assets/js/app/pages/admin/case-detail.js:1626 |
| CSF-99 | عنوان | إسنادات مسحوبة (… ) | public/assets/js/app/pages/admin/case-detail.js:1626 |
| CSF-100 | حقل | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:1676 |
| CSF-101 | حالة فارغة | لا يوجد محامون نشطون غير أعضاء الفريق الحاليين | public/assets/js/app/pages/admin/case-detail.js:1708 |
| CSF-102 | حقل | التخصص المطلوب | public/assets/js/app/pages/admin/case-detail.js:1724 |
| CSF-103 | حقل | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:1789 |
| CSF-104 | تنبيه | طلب مساعدة محامٍ | public/assets/js/app/pages/admin/case-detail.js:1803 |
| CSF-105 | قسم/بطاقة | اختيار المحامي | public/assets/js/app/pages/admin/case-detail.js:1807 |
| CSF-106 | عنوان | اختيار المحامي | public/assets/js/app/pages/admin/case-detail.js:1807 |
| CSF-107 | قسم/بطاقة | الدور والتكليف والأتعاب | public/assets/js/app/pages/admin/case-detail.js:1811 |
| CSF-108 | عنوان | الدور والتكليف والأتعاب | public/assets/js/app/pages/admin/case-detail.js:1811 |
| CSF-109 | قسم/بطاقة | ما يراه هذا المحامي | public/assets/js/app/pages/admin/case-detail.js:1814 |
| CSF-110 | عنوان | ما يراه هذا المحامي | public/assets/js/app/pages/admin/case-detail.js:1814 |
| CSF-111 | عنصر قائمة | إلغاء | public/assets/js/app/pages/admin/case-detail.js:1832 |
| CSF-112 | تنبيه | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:1840 |
| CSF-113 | عنصر قائمة | إسناد المحامي | public/assets/js/app/pages/admin/case-detail.js:1875 |
| CSF-114 | نافذة | إسناد طلب المساعدة إلى محامٍ | public/assets/js/app/pages/admin/case-detail.js:1883 |
| CSF-115 | عنصر قائمة | إلغاء | public/assets/js/app/pages/admin/case-detail.js:1900 |
| CSF-116 | عنصر قائمة | حفظ الصلاحيات | public/assets/js/app/pages/admin/case-detail.js:1909 |
| CSF-117 | نافذة | ما يراه | public/assets/js/app/pages/admin/case-detail.js:1915 |
| CSF-118 | رابط | عرض | public/assets/js/app/pages/admin/case-detail.js:2053 |
| CSF-119 | زر | الرد على طلب المهلة | public/assets/js/app/pages/admin/case-detail.js:2070 |
| CSF-120 | زر | رفض الطلب | public/assets/js/app/pages/admin/case-detail.js:2071 |
| CSF-121 | زر | موافقة وإرسال للشركة | public/assets/js/app/pages/admin/case-detail.js:2073 |
| CSF-122 | زر | الرد مباشرة دون سؤال الشركة | public/assets/js/app/pages/admin/case-detail.js:2074 |
| CSF-123 | زر | رفض الطلب | public/assets/js/app/pages/admin/case-detail.js:2075 |
| CSF-124 | زر | تسجيل رد … | public/assets/js/app/pages/admin/case-detail.js:2077 |
| CSF-125 | زر | إتاحة للمحامي | public/assets/js/app/pages/admin/case-detail.js:2078 |
| CSF-126 | زر | إلغاء الطلب | public/assets/js/app/pages/admin/case-detail.js:2079 |
| CSF-127 | زر | مراجعة وإتاحة للمحامي | public/assets/js/app/pages/admin/case-detail.js:2081 |
| CSF-128 | زر | تسجيل رد إضافي | public/assets/js/app/pages/admin/case-detail.js:2082 |
| CSF-129 | زر | إلغاء الطلب | public/assets/js/app/pages/admin/case-detail.js:2083 |
| CSF-130 | زر | إسناد إلى محامٍ | public/assets/js/app/pages/admin/case-detail.js:2126 |
| CSF-131 | زر | رفض | public/assets/js/app/pages/admin/case-detail.js:2127 |
| CSF-132 | زر | عرض في الفريق | public/assets/js/app/pages/admin/case-detail.js:2154 |
| CSF-133 | تنبيه | المحامي لا يتواصل مع الشركة أبدًا: توافق الإدارة على طلبه فيصل الشركة… | public/assets/js/app/pages/admin/case-detail.js:2172 |
| CSF-134 | زر | طلب من … مباشرة | public/assets/js/app/pages/admin/case-detail.js:2178 |
| CSF-135 | حالة فارغة | لا توجد طلبات معلومات أو مستندات في هذا الملف | public/assets/js/app/pages/admin/case-detail.js:2179 |
| CSF-136 | عنوان | طلبات المعلومات والمستندات | public/assets/js/app/pages/admin/case-detail.js:2180 |
| CSF-137 | قسم/بطاقة | طلبات المعلومات والمستندات | public/assets/js/app/pages/admin/case-detail.js:2181 |
| CSF-138 | حالة فارغة | لم يطلب أي محامٍ مساعدة في هذا الملف | public/assets/js/app/pages/admin/case-detail.js:2187 |
| CSF-139 | عنوان | طلبات مساعدة محامٍ | public/assets/js/app/pages/admin/case-detail.js:2188 |
| CSF-140 | قسم/بطاقة | طلبات مساعدة محامٍ | public/assets/js/app/pages/admin/case-detail.js:2189 |
| CSF-141 | تنبيه | لا يوجد في فريق الملف محامٍ يُتاح له الرد. أسند محاميًا أولًا من تبوي… | public/assets/js/app/pages/admin/case-detail.js:2295 |
| CSF-142 | تنبيه | يصل الرد نفسه تلقائيًا أيضًا إلى: … (طلبوا الشيء نفسه). | public/assets/js/app/pages/admin/case-detail.js:2297 |
| CSF-143 | تنبيه | لم يصل بعد من … : … .… | public/assets/js/app/pages/admin/case-detail.js:2299 |
| CSF-144 | قسم/بطاقة | مسار الرأي حتى يصل … | public/assets/js/app/pages/admin/case-detail.js:2447 |
| CSF-145 | زر | اعتماد الرأي | public/assets/js/app/pages/admin/case-detail.js:2469 |
| CSF-146 | زر | إعادة للمحامي | public/assets/js/app/pages/admin/case-detail.js:2470 |
| CSF-147 | زر | إعداد رد … من هذا الرأي | public/assets/js/app/pages/admin/case-detail.js:2474 |
| CSF-148 | حالة فارغة | لم يقدّم أي محامٍ رأيه بعد. ستظهر الآراء هنا فور تقديمها للإدارة. | public/assets/js/app/pages/admin/case-detail.js:2503 |
| CSF-149 | عنوان | آراء المحامين | public/assets/js/app/pages/admin/case-detail.js:2504 |
| CSF-150 | قسم/بطاقة | آراء المحامين | public/assets/js/app/pages/admin/case-detail.js:2505 |
| CSF-151 | سؤال قابل للفتح | الإصدارات السابقة (… ) | public/assets/js/app/pages/admin/case-detail.js:2523 |
| CSF-152 | عنوان | الإصدارات السابقة (… ) | public/assets/js/app/pages/admin/case-detail.js:2523 |
| CSF-153 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:2525 |
| CSF-154 | قسم/بطاقة | عضو #… | public/assets/js/app/pages/admin/case-detail.js:2526 |
| CSF-155 | زر | إرسال … | public/assets/js/app/pages/admin/case-detail.js:2554 |
| CSF-156 | زر | تعديل | public/assets/js/app/pages/admin/case-detail.js:2555 |
| CSF-157 | زر | متابعة مسودة الرد | public/assets/js/app/pages/admin/case-detail.js:2566 |
| CSF-158 | حالة فارغة | لم يُعَدّ رد … بعد. ابدأ من رأي معتمد. | public/assets/js/app/pages/admin/case-detail.js:2569 |
| CSF-159 | عنوان | الرد الموجه | public/assets/js/app/pages/admin/case-detail.js:2570 |
| CSF-160 | قسم/بطاقة | الرد الموجه | public/assets/js/app/pages/admin/case-detail.js:2571 |
| CSF-161 | عنوان | التسليم للشركة | public/assets/js/app/pages/admin/case-detail.js:2581 |
| CSF-162 | قسم/بطاقة | التسليم للشركة | public/assets/js/app/pages/admin/case-detail.js:2581 |
| CSF-163 | زر | إعادة للمحامي | public/assets/js/app/pages/admin/case-detail.js:2595 |
| CSF-164 | تنبيه | وصل للمحامي رد على طلبه بعد التقديم (… ). | public/assets/js/app/pages/admin/case-detail.js:2598 |
| CSF-165 | زر | صياغة مبسطة بالذكاء الاصطناعي | public/assets/js/app/pages/admin/case-detail.js:2669 |
| CSF-166 | زر | اقتراح | public/assets/js/app/pages/admin/case-detail.js:2713 |
| CSF-167 | زر | اقتراح | public/assets/js/app/pages/admin/case-detail.js:2722 |
| CSF-168 | زر | تنزيل | public/assets/js/app/pages/admin/case-detail.js:2874 |
| CSF-169 | زر | إعادة تسمية | public/assets/js/app/pages/admin/case-detail.js:2875 |
| CSF-170 | جدول | لا توجد مستندات في هذا الملف بعد | public/assets/js/app/pages/admin/case-detail.js:2891 |
| CSF-171 | جدول | لا توجد مستندات في هذا الملف بعد | public/assets/js/app/pages/admin/case-detail.js:2891 |
| CSF-172 | عنوان | مستندات الملف | public/assets/js/app/pages/admin/case-detail.js:2892 |
| CSF-173 | قسم/بطاقة | مستندات الملف | public/assets/js/app/pages/admin/case-detail.js:2893 |
| CSF-174 | عنوان | رفع مستندات جديدة | public/assets/js/app/pages/admin/case-detail.js:2906 |
| CSF-175 | قسم/بطاقة | رفع مستندات جديدة | public/assets/js/app/pages/admin/case-detail.js:2907 |
| CSF-176 | عنوان | المحادثة | public/assets/js/app/pages/admin/case-detail.js:2926 |
| CSF-177 | قسم/بطاقة | المحادثة | public/assets/js/app/pages/admin/case-detail.js:2926 |
| CSF-178 | تنبيه | المحادثة الأصلية مع … تراها الإدارة فقط، ولا تُتاح لأي محامٍ. الرسائل… | public/assets/js/app/pages/admin/case-detail.js:2930 |
| CSF-179 | تنبيه | رسائل تعذر إرسالها: … . يمكنك إعادة المحاولة من داخل الرسالة. | public/assets/js/app/pages/admin/case-detail.js:2931 |
| CSF-180 | حالة فارغة | لا تتوفر بيانات التكلفة لهذا الملف | public/assets/js/app/pages/admin/case-detail.js:2969 |
| CSF-181 | بطاقة رقم | إجمالي تكلفة الملف | public/assets/js/app/pages/admin/case-detail.js:2993 |
| CSF-182 | بطاقة رقم | التكلفة المباشرة | public/assets/js/app/pages/admin/case-detail.js:2994 |
| CSF-183 | بطاقة رقم | التكلفة المحمّلة | public/assets/js/app/pages/admin/case-detail.js:2995 |
| CSF-184 | بطاقة رقم | قيمة المساهمات التطوعية | public/assets/js/app/pages/admin/case-detail.js:2996 |
| CSF-185 | تنبيه | التكلفة المحمّلة تقديرية (حصة من المبالغ الشهرية أو الباقات). التكلفة… | public/assets/js/app/pages/admin/case-detail.js:2998 |
| CSF-186 | عنوان | مكونات التكلفة | public/assets/js/app/pages/admin/case-detail.js:2999 |
| CSF-187 | قسم/بطاقة | مكونات التكلفة | public/assets/js/app/pages/admin/case-detail.js:2999 |
| CSF-188 | عنصر قائمة | البند | public/assets/js/app/pages/admin/case-detail.js:3006 |
| CSF-189 | عنصر قائمة | النوع | public/assets/js/app/pages/admin/case-detail.js:3007 |
| CSF-190 | عنصر قائمة | حالة القيد | public/assets/js/app/pages/admin/case-detail.js:3008 |
| CSF-191 | عنصر قائمة | المبلغ | public/assets/js/app/pages/admin/case-detail.js:3009 |
| CSF-192 | جدول | البند | public/assets/js/app/pages/admin/case-detail.js:3014 |
| CSF-193 | جدول | البند | public/assets/js/app/pages/admin/case-detail.js:3015 |
| CSF-194 | عنوان | بنود التكلفة | public/assets/js/app/pages/admin/case-detail.js:3017 |
| CSF-195 | قسم/بطاقة | بنود التكلفة | public/assets/js/app/pages/admin/case-detail.js:3018 |
| CSF-196 | رابط | افتح المحادثة ورد عليها | public/assets/js/app/pages/admin/case-detail.js:3096 |
| CSF-197 | تنبيه | فيه رسالة من … لم يُرد عليها (… ): «… ». | public/assets/js/app/pages/admin/case-detail.js:3099 |
| CSF-198 | عنصر قائمة | نظرة عامة | public/assets/js/app/pages/admin/case-detail.js:3225 |
| CSF-199 | عنصر قائمة | الفريق والصلاحيات | public/assets/js/app/pages/admin/case-detail.js:3226 |
| CSF-200 | عنصر قائمة | الطلبات | public/assets/js/app/pages/admin/case-detail.js:3227 |
| CSF-201 | عنصر قائمة | الآراء والمراجعة | public/assets/js/app/pages/admin/case-detail.js:3228 |
| CSF-202 | عنصر قائمة | المستندات | public/assets/js/app/pages/admin/case-detail.js:3229 |
| CSF-203 | عنصر قائمة | المحادثة | public/assets/js/app/pages/admin/case-detail.js:3230 |
| CSF-204 | عنوان | السجل الزمني للملف | public/assets/js/app/pages/admin/case-detail.js:3231 |
| CSF-205 | قسم/بطاقة | السجل الزمني للملف | public/assets/js/app/pages/admin/case-detail.js:3231 |
| CSF-206 | عنصر قائمة | السجل | public/assets/js/app/pages/admin/case-detail.js:3231 |
| CSF-207 | عنصر قائمة | التكلفة | public/assets/js/app/pages/admin/case-detail.js:3232 |
| CSF-208 | خيار | نظرة عامة | public/assets/js/app/pages/admin/case-detail.js:3234 |
| CSF-209 | زر | فتح طلب الشركة | public/assets/js/app/pages/admin/case-detail.js:3243 |
| CSF-210 | نموذج | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:95 |
| CSF-211 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:980 |
| CSF-212 | عنصر قائمة | دور المحامي في الملف | public/assets/js/app/pages/admin/case-detail.js:1742 |
| CSF-213 | عنصر قائمة | موعد التسليم | public/assets/js/app/pages/admin/case-detail.js:1744 |
| CSF-214 | عنصر قائمة | معاملة الأتعاب لهذا الإسناد | public/assets/js/app/pages/admin/case-detail.js:1756 |
| CSF-215 | عنصر قائمة | مبلغ الأتعاب | public/assets/js/app/pages/admin/case-detail.js:1758 |
| CSF-216 | عنصر قائمة | السؤال المطلوب تحديدًا | public/assets/js/app/pages/admin/case-detail.js:1769 |
| CSF-217 | نموذج | دور المحامي في الملف | public/assets/js/app/pages/admin/case-detail.js:1780 |
| CSF-218 | عنصر قائمة | السؤال المطلوب تحديدًا | public/assets/js/app/pages/admin/case-detail.js:1925 |
| CSF-219 | عنصر قائمة | موعد التسليم | public/assets/js/app/pages/admin/case-detail.js:1926 |
| CSF-220 | عنصر قائمة | معاملة الأتعاب | public/assets/js/app/pages/admin/case-detail.js:1937 |
| CSF-221 | عنصر قائمة | مبلغ الأتعاب | public/assets/js/app/pages/admin/case-detail.js:1939 |
| CSF-222 | عنصر قائمة | السؤال المطلوب تحديدًا | public/assets/js/app/pages/admin/case-detail.js:1982 |
| CSF-223 | عنصر قائمة | موعد التسليم | public/assets/js/app/pages/admin/case-detail.js:1990 |
| CSF-224 | عنصر قائمة | سبب السحب (يصل للمحامي) | public/assets/js/app/pages/admin/case-detail.js:2008 |
| CSF-225 | عنصر قائمة | نوع الطلب | public/assets/js/app/pages/admin/case-detail.js:2200 |
| CSF-226 | عنصر قائمة | قناة الإرسال | public/assets/js/app/pages/admin/case-detail.js:2201 |
| CSF-227 | عنصر قائمة | المطلوب (للسجل الداخلي) | public/assets/js/app/pages/admin/case-detail.js:2202 |
| CSF-228 | عنصر قائمة | نص الرسالة | public/assets/js/app/pages/admin/case-detail.js:2203 |
| CSF-229 | عنصر قائمة | البنود المطلوبة (لطلب المستند، بند في كل سطر) | public/assets/js/app/pages/admin/case-detail.js:2205 |
| CSF-230 | عنصر قائمة | نص الرسالة للشركة | public/assets/js/app/pages/admin/case-detail.js:2235 |
| CSF-231 | عنصر قائمة | البنود المطلوبة (بند في كل سطر، حتى 5) | public/assets/js/app/pages/admin/case-detail.js:2236 |
| CSF-232 | عنصر قائمة | نص الرسالة | public/assets/js/app/pages/admin/case-detail.js:2251 |
| CSF-233 | عنصر قائمة | البنود المطلوبة من | public/assets/js/app/pages/admin/case-detail.js:2253 |
| CSF-234 | عنصر قائمة | قناة الإرسال | public/assets/js/app/pages/admin/case-detail.js:2254 |
| CSF-235 | عنصر قائمة | سبب الرفض | public/assets/js/app/pages/admin/case-detail.js:2271 |
| CSF-236 | عنصر قائمة | اطلب الباقي من | public/assets/js/app/pages/admin/case-detail.js:2303 |
| CSF-237 | عنصر قائمة | تمديد الموعد إلى | public/assets/js/app/pages/admin/case-detail.js:2305 |
| CSF-238 | عنصر قائمة | الرد المتاح للمحامي | public/assets/js/app/pages/admin/case-detail.js:2314 |
| CSF-239 | عنصر قائمة | المستندات التي تُتاح معه | public/assets/js/app/pages/admin/case-detail.js:2323 |
| CSF-240 | عنصر قائمة | share_with_assignment_ids | public/assets/js/app/pages/admin/case-detail.js:2332 |
| CSF-241 | عنصر قائمة | رسائل | public/assets/js/app/pages/admin/case-detail.js:2374 |
| CSF-242 | عنصر قائمة | رسائل | public/assets/js/app/pages/admin/case-detail.js:2375 |
| CSF-243 | عنصر قائمة | مستندات أخرى في الملف تخص هذا الطلب | public/assets/js/app/pages/admin/case-detail.js:2381 |
| CSF-244 | عنصر قائمة | ملخص الرد (اختياري) | public/assets/js/app/pages/admin/case-detail.js:2383 |
| CSF-245 | عنصر قائمة | سبب الرفض | public/assets/js/app/pages/admin/case-detail.js:2422 |
| CSF-246 | عنصر قائمة | تقييم جودة الرأي | public/assets/js/app/pages/admin/case-detail.js:2612 |
| CSF-247 | عنصر قائمة | ملاحظة للمحامي (اختيارية) | public/assets/js/app/pages/admin/case-detail.js:2613 |
| CSF-248 | عنصر قائمة | ملاحظات الإعادة | public/assets/js/app/pages/admin/case-detail.js:2626 |
| CSF-249 | عنصر قائمة | الرأي المعتمد الذي يُبنى عليه الرد | public/assets/js/app/pages/admin/case-detail.js:2754 |
| CSF-250 | عنصر قائمة | مساعدة الذكاء الاصطناعي | public/assets/js/app/pages/admin/case-detail.js:2756 |
| CSF-251 | عنصر قائمة | الخلاصة بكلام بسيط (أول حاجة تظهر | public/assets/js/app/pages/admin/case-detail.js:2758 |
| CSF-252 | عنصر قائمة | الخطوات المطلوبة منها (خطوة في كل سطر) | public/assets/js/app/pages/admin/case-detail.js:2760 |
| CSF-253 | عنصر قائمة | رسالة صوتية | public/assets/js/app/pages/admin/case-detail.js:2763 |
| CSF-254 | عنصر قائمة | نص الرد | public/assets/js/app/pages/admin/case-detail.js:2765 |
| CSF-255 | عنصر قائمة | قناة الإرسال | public/assets/js/app/pages/admin/case-detail.js:2816 |
| CSF-256 | عنصر قائمة | عنوان المستند | public/assets/js/app/pages/admin/case-detail.js:2915 |
| CSF-257 | عنصر قائمة | نص الرسالة | public/assets/js/app/pages/admin/case-detail.js:3031 |
| CSF-258 | عنصر قائمة | قناة الإرسال | public/assets/js/app/pages/admin/case-detail.js:3032 |
| CSF-259 | عنصر قائمة | عنوان الملف | public/assets/js/app/pages/admin/case-detail.js:3051 |
| CSF-260 | عنصر قائمة | المجال القانوني | public/assets/js/app/pages/admin/case-detail.js:3052 |
| CSF-261 | عنصر قائمة | الأولوية | public/assets/js/app/pages/admin/case-detail.js:3053 |
| CSF-262 | عنصر قائمة | الموعد المستهدف | public/assets/js/app/pages/admin/case-detail.js:3054 |
| CSF-263 | عنصر قائمة | مدير الحالة | public/assets/js/app/pages/admin/case-detail.js:3055 |
| CSF-264 | عنصر قائمة | نتيجة الملف | public/assets/js/app/pages/admin/case-detail.js:3113 |
| CSF-265 | عنصر قائمة | ملاحظة الإغلاق | public/assets/js/app/pages/admin/case-detail.js:3114 |
| CSF-266 | عنصر قائمة | سبب إعادة الفتح (اختياري) | public/assets/js/app/pages/admin/case-detail.js:3127 |
| CSF-267 | عنصر قائمة | نوع الملف | public/assets/js/app/pages/admin/case-detail.js:3146 |
| CSF-268 | عنصر قائمة | المحامي المسؤول | public/assets/js/app/pages/admin/case-detail.js:3147 |
| CSF-269 | عنصر قائمة | عنوان الملف المستمر | public/assets/js/app/pages/admin/case-detail.js:3148 |
| CSF-270 | عنصر قائمة | المحكمة | public/assets/js/app/pages/admin/case-detail.js:3149 |
| CSF-271 | عنصر قائمة | الدائرة | public/assets/js/app/pages/admin/case-detail.js:3150 |
| CSF-272 | عنصر قائمة | رقم الدعوى | public/assets/js/app/pages/admin/case-detail.js:3151 |
| CSF-273 | عنصر قائمة | سنة الدعوى | public/assets/js/app/pages/admin/case-detail.js:3152 |
| CSF-274 | عنصر قائمة | الخصم | public/assets/js/app/pages/admin/case-detail.js:3153 |
| CSF-275 | عنصر قائمة | الأتعاب المتفق عليها مع | public/assets/js/app/pages/admin/case-detail.js:3154 |
| CSF-276 | عنصر قائمة | ملاحظات وتكليف المحامي | public/assets/js/app/pages/admin/case-detail.js:3155 |
| CSF-277 | عنصر قائمة | أضف للملف المستمر مستندات الاستشارة التي سبق إتاحتها لهذا المحامي (بل… | public/assets/js/app/pages/admin/case-detail.js:3157 |
| CSF-278 | عنصر قائمة | إغلاق ملف الاستشارة بنتيجة «تحوّل إلى ملف عمل مستمر» | public/assets/js/app/pages/admin/case-detail.js:3158 |
| CSF-279 | عنصر قائمة | عنوان المسألة | public/assets/js/app/pages/admin/case-detail.js:3201 |
| CSF-280 | عنصر قائمة | مجال المسألة | public/assets/js/app/pages/admin/case-detail.js:3202 |
| CSF-281 | عنصر قائمة | تفاصيل (اختيارية) | public/assets/js/app/pages/admin/case-detail.js:3203 |
| CSF-282 | عنصر | (نص متغير) | public/assets/js/app/pages/admin/case-detail.js:2873 |

## PTY: الأطراف وتعارض المصالح داخل الملف (يظهر في: تبويب الأطراف في صفحة الملف)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| PTY-01 | رابط | مستفيد/ة | public/assets/js/app/components/parties.js:15 |
| PTY-02 | رابط | (نص متغير) | public/assets/js/app/components/parties.js:20 |
| PTY-03 | زر | إضافة طرف | public/assets/js/app/components/parties.js:66 |
| PTY-04 | عنوان | أطراف الملف وتعارض المصالح | public/assets/js/app/components/parties.js:74 |
| PTY-05 | قسم/بطاقة | أطراف الملف وتعارض المصالح | public/assets/js/app/components/parties.js:75 |
| PTY-06 | زر | تعديل بيانات « | public/assets/js/app/components/parties.js:99 |
| PTY-07 | زر | حذف « | public/assets/js/app/components/parties.js:101 |
| PTY-08 | زر | إضافة طرف | public/assets/js/app/components/parties.js:128 |
| PTY-09 | حالة فارغة | لم يُسجَّل أي طرف لهذا الملف. | public/assets/js/app/components/parties.js:129 |
| PTY-10 | نافذة | تعديل بيانات الطرف «… » | public/assets/js/app/components/parties.js:151 |
| PTY-11 | نافذة | حذف طرف من الملف | public/assets/js/app/components/parties.js:161 |
| PTY-12 | عنصر قائمة | صفة الطرف | public/assets/js/app/components/parties.js:42 |
| PTY-13 | عنصر قائمة | الاسم كاملًا | public/assets/js/app/components/parties.js:43 |
| PTY-14 | عنصر قائمة | الرقم القومي (اختياري) | public/assets/js/app/components/parties.js:44 |
| PTY-15 | عنصر قائمة | ملاحظات | public/assets/js/app/components/parties.js:45 |

## MTL: الملفات المستمرة (`/app#/matters`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| MTL-01 | بطاقة رقم | ملفات مستمرة نشطة | public/assets/js/app/pages/admin/matters.js:95 |
| MTL-02 | بطاقة رقم | مواعيد خلال 7 أيام | public/assets/js/app/pages/admin/matters.js:96 |
| MTL-03 | بطاقة رقم | مهام متأخرة | public/assets/js/app/pages/admin/matters.js:97 |
| MTL-04 | بطاقة رقم | فواتير غير مسددة | public/assets/js/app/pages/admin/matters.js:98 |
| MTL-05 | زر | (نص متغير) | public/assets/js/app/pages/admin/matters.js:109 |
| MTL-06 | رابط | فتح الملف … | public/assets/js/app/pages/admin/matters.js:125 |
| MTL-07 | قسم/بطاقة | جدول الملفات المستمرة | public/assets/js/app/pages/admin/matters.js:193 |
| MTL-08 | جدول | جدول الملفات المستمرة | public/assets/js/app/pages/admin/matters.js:203 |
| MTL-09 | جدول | جدول الملفات المستمرة | public/assets/js/app/pages/admin/matters.js:204 |
| MTL-10 | عنصر قائمة | لوحة المتابعة | public/assets/js/app/pages/admin/matters.js:220 |
| MTL-11 | زر | ملفات الاستشارات | public/assets/js/app/pages/admin/matters.js:221 |
| MTL-12 | عنوان | الملفات المستمرة | public/assets/js/app/pages/admin/matters.js:222 |
| MTL-13 | عنوان | الملفات المستمرة | public/assets/js/app/pages/admin/matters.js:223 |
| MTL-14 | حقل | بحث في الملفات المستمرة | public/assets/js/app/pages/admin/matters.js:236 |

## MTF: ملف مستمر (`/app#/matters/`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| MTF-01 | عنصر قائمة | الملفات المستمرة | public/assets/js/app/pages/admin/matter-detail.js:108 |
| MTF-02 | رابط | صفحة الملف | public/assets/js/app/pages/admin/matter-detail.js:113 |
| MTF-03 | زر | الاستشارة الأصلية | public/assets/js/app/pages/admin/matter-detail.js:120 |
| MTF-04 | زر | رسالة … | public/assets/js/app/pages/admin/matter-detail.js:121 |
| MTF-05 | زر | تعديل بيانات الملف | public/assets/js/app/pages/admin/matter-detail.js:128 |
| MTF-06 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/matter-detail.js:131 |
| MTF-07 | عنوان | الملفات المستمرة | public/assets/js/app/pages/admin/matter-detail.js:132 |
| MTF-08 | بطاقة رقم | الموعد القادم | public/assets/js/app/pages/admin/matter-detail.js:152 |
| MTF-09 | بطاقة رقم | مهام مفتوحة | public/assets/js/app/pages/admin/matter-detail.js:161 |
| MTF-10 | بطاقة رقم | المتبقي على | public/assets/js/app/pages/admin/matter-detail.js:170 |
| MTF-11 | بطاقة رقم | المصروفات | public/assets/js/app/pages/admin/matter-detail.js:172 |
| MTF-12 | عنوان | بيانات الدعوى | public/assets/js/app/pages/admin/matter-detail.js:196 |
| MTF-13 | قسم/بطاقة | بيانات الدعوى | public/assets/js/app/pages/admin/matter-detail.js:197 |
| MTF-14 | رابط | بدون اسم | public/assets/js/app/pages/admin/matter-detail.js:205 |
| MTF-15 | زر | (نص متغير) | public/assets/js/app/pages/admin/matter-detail.js:206 |
| MTF-16 | رابط | (نص متغير) | public/assets/js/app/pages/admin/matter-detail.js:207 |
| MTF-17 | رابط | (نص متغير) | public/assets/js/app/pages/admin/matter-detail.js:211 |
| MTF-18 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/matter-detail.js:217 |
| MTF-19 | قسم/بطاقة | … والمحامي المسؤول | public/assets/js/app/pages/admin/matter-detail.js:218 |
| MTF-20 | زر | اعتماد تذكير … | public/assets/js/app/pages/admin/matter-detail.js:337 |
| MTF-21 | زر | تسجيل ما تم | public/assets/js/app/pages/admin/matter-detail.js:338 |
| MTF-22 | زر | تعديل | public/assets/js/app/pages/admin/matter-detail.js:339 |
| MTF-23 | تنبيه | المواعيد التي يلزم فيها حضور … يُرسَل … بشأنها تذكير آلي عبر واتساب ق… | public/assets/js/app/pages/admin/matter-detail.js:388 |
| MTF-24 | تنبيه | تذكيرات بانتظار الاعتماد | public/assets/js/app/pages/admin/matter-detail.js:393 |
| MTF-25 | زر | إضافة جلسة أو موعد | public/assets/js/app/pages/admin/matter-detail.js:398 |
| MTF-26 | حالة فارغة | لا توجد مواعيد قادمة مجدولة | public/assets/js/app/pages/admin/matter-detail.js:399 |
| MTF-27 | عنوان | المواعيد القادمة | public/assets/js/app/pages/admin/matter-detail.js:400 |
| MTF-28 | قسم/بطاقة | المواعيد القادمة | public/assets/js/app/pages/admin/matter-detail.js:401 |
| MTF-29 | عنوان | مواعيد سابقة أو منتهية | public/assets/js/app/pages/admin/matter-detail.js:403 |
| MTF-30 | قسم/بطاقة | مواعيد سابقة أو منتهية | public/assets/js/app/pages/admin/matter-detail.js:403 |
| MTF-31 | زر | تم الإنجاز | public/assets/js/app/pages/admin/matter-detail.js:506 |
| MTF-32 | زر | تعديل | public/assets/js/app/pages/admin/matter-detail.js:507 |
| MTF-33 | زر | إلغاء | public/assets/js/app/pages/admin/matter-detail.js:515 |
| MTF-34 | زر | إعادة فتح | public/assets/js/app/pages/admin/matter-detail.js:517 |
| MTF-35 | زر | إضافة مهمة | public/assets/js/app/pages/admin/matter-detail.js:526 |
| MTF-36 | جدول | مهام الملف المستمر | public/assets/js/app/pages/admin/matter-detail.js:533 |
| MTF-37 | جدول | مهام الملف المستمر | public/assets/js/app/pages/admin/matter-detail.js:534 |
| MTF-38 | عنوان | المهام والمواعيد الإجرائية | public/assets/js/app/pages/admin/matter-detail.js:536 |
| MTF-39 | قسم/بطاقة | المهام والمواعيد الإجرائية | public/assets/js/app/pages/admin/matter-detail.js:537 |
| MTF-40 | زر | تسجيل دفعة | public/assets/js/app/pages/admin/matter-detail.js:631 |
| MTF-41 | زر | إلغاء | public/assets/js/app/pages/admin/matter-detail.js:632 |
| MTF-42 | بطاقة رقم | إجمالي الفواتير | public/assets/js/app/pages/admin/matter-detail.js:642 |
| MTF-43 | بطاقة رقم | المحصّل | public/assets/js/app/pages/admin/matter-detail.js:643 |
| MTF-44 | بطاقة رقم | المتبقي | public/assets/js/app/pages/admin/matter-detail.js:644 |
| MTF-45 | بطاقة رقم | الأتعاب المتفق عليها | public/assets/js/app/pages/admin/matter-detail.js:645 |
| MTF-46 | قسم/بطاقة | المحصّل من الأتعاب المتفق عليها (… من … ) | public/assets/js/app/pages/admin/matter-detail.js:650 |
| MTF-47 | زر | إصدار فاتورة | public/assets/js/app/pages/admin/matter-detail.js:656 |
| MTF-48 | جدول | فواتير الملف المستمر | public/assets/js/app/pages/admin/matter-detail.js:657 |
| MTF-49 | جدول | فواتير الملف المستمر | public/assets/js/app/pages/admin/matter-detail.js:657 |
| MTF-50 | عنوان | الفواتير | public/assets/js/app/pages/admin/matter-detail.js:658 |
| MTF-51 | قسم/بطاقة | الفواتير | public/assets/js/app/pages/admin/matter-detail.js:659 |
| MTF-52 | عنصر قائمة | رقم الإيصال | public/assets/js/app/pages/admin/matter-detail.js:667 |
| MTF-53 | عنصر قائمة | الفاتورة | public/assets/js/app/pages/admin/matter-detail.js:668 |
| MTF-54 | عنصر قائمة | المبلغ | public/assets/js/app/pages/admin/matter-detail.js:669 |
| MTF-55 | عنصر قائمة | تاريخ الدفع | public/assets/js/app/pages/admin/matter-detail.js:670 |
| MTF-56 | عنصر قائمة | الطريقة | public/assets/js/app/pages/admin/matter-detail.js:671 |
| MTF-57 | عنصر قائمة | المرجع | public/assets/js/app/pages/admin/matter-detail.js:672 |
| MTF-58 | عنصر قائمة | إيصال | public/assets/js/app/pages/admin/matter-detail.js:673 |
| MTF-59 | جدول | رقم الإيصال | public/assets/js/app/pages/admin/matter-detail.js:678 |
| MTF-60 | جدول | رقم الإيصال | public/assets/js/app/pages/admin/matter-detail.js:679 |
| MTF-61 | عنوان | المدفوعات | public/assets/js/app/pages/admin/matter-detail.js:681 |
| MTF-62 | قسم/بطاقة | المدفوعات | public/assets/js/app/pages/admin/matter-detail.js:682 |
| MTF-63 | زر | تسجيل مصروفات | public/assets/js/app/pages/admin/matter-detail.js:745 |
| MTF-64 | عنصر قائمة | البيان | public/assets/js/app/pages/admin/matter-detail.js:749 |
| MTF-65 | عنصر قائمة | المبلغ | public/assets/js/app/pages/admin/matter-detail.js:750 |
| MTF-66 | عنصر قائمة | من دفعها | public/assets/js/app/pages/admin/matter-detail.js:751 |
| MTF-67 | عنصر قائمة | المحامي | public/assets/js/app/pages/admin/matter-detail.js:752 |
| MTF-68 | عنصر قائمة | التاريخ | public/assets/js/app/pages/admin/matter-detail.js:753 |
| MTF-69 | جدول | البيان | public/assets/js/app/pages/admin/matter-detail.js:758 |
| MTF-70 | جدول | البيان | public/assets/js/app/pages/admin/matter-detail.js:759 |
| MTF-71 | عنوان | المصروفات | public/assets/js/app/pages/admin/matter-detail.js:761 |
| MTF-72 | قسم/بطاقة | المصروفات | public/assets/js/app/pages/admin/matter-detail.js:762 |
| MTF-73 | تنبيه | أتعاب المحامي عن الملف المستمر تُقيَّد في كشف حسابه وتُصرف من صفحة ال… | public/assets/js/app/pages/admin/matter-detail.js:789 |
| MTF-74 | زر | المحاسبة | public/assets/js/app/pages/admin/matter-detail.js:796 |
| MTF-75 | زر | تسجيل أتعاب | public/assets/js/app/pages/admin/matter-detail.js:803 |
| MTF-76 | عنصر قائمة | المحامي | public/assets/js/app/pages/admin/matter-detail.js:808 |
| MTF-77 | عنصر قائمة | النوع | public/assets/js/app/pages/admin/matter-detail.js:809 |
| MTF-78 | عنصر قائمة | البيان | public/assets/js/app/pages/admin/matter-detail.js:810 |
| MTF-79 | عنصر قائمة | المبلغ | public/assets/js/app/pages/admin/matter-detail.js:811 |
| MTF-80 | عنصر قائمة | الشهر | public/assets/js/app/pages/admin/matter-detail.js:812 |
| MTF-81 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/matter-detail.js:813 |
| MTF-82 | عنصر قائمة | التاريخ | public/assets/js/app/pages/admin/matter-detail.js:814 |
| MTF-83 | جدول | المحامي | public/assets/js/app/pages/admin/matter-detail.js:820 |
| MTF-84 | جدول | المحامي | public/assets/js/app/pages/admin/matter-detail.js:821 |
| MTF-85 | عنوان | أتعاب ومستحقات المحامين | public/assets/js/app/pages/admin/matter-detail.js:823 |
| MTF-86 | قسم/بطاقة | أتعاب ومستحقات المحامين | public/assets/js/app/pages/admin/matter-detail.js:824 |
| MTF-87 | عنصر قائمة | المستند | public/assets/js/app/pages/admin/matter-detail.js:861 |
| MTF-88 | عنصر قائمة | أضافه | public/assets/js/app/pages/admin/matter-detail.js:863 |
| MTF-89 | عنصر قائمة | التاريخ | public/assets/js/app/pages/admin/matter-detail.js:864 |
| MTF-90 | عنصر قائمة | الحجم | public/assets/js/app/pages/admin/matter-detail.js:865 |
| MTF-91 | زر | تنزيل | public/assets/js/app/pages/admin/matter-detail.js:873 |
| MTF-92 | عنصر قائمة | إجراءات | public/assets/js/app/pages/admin/matter-detail.js:879 |
| MTF-93 | جدول | المستند | public/assets/js/app/pages/admin/matter-detail.js:885 |
| MTF-94 | جدول | المستند | public/assets/js/app/pages/admin/matter-detail.js:886 |
| MTF-95 | عنوان | مستندات الملف المستمر | public/assets/js/app/pages/admin/matter-detail.js:888 |
| MTF-96 | قسم/بطاقة | مستندات الملف المستمر | public/assets/js/app/pages/admin/matter-detail.js:889 |
| MTF-97 | عنوان | رفع مستندات | public/assets/js/app/pages/admin/matter-detail.js:954 |
| MTF-98 | قسم/بطاقة | رفع مستندات | public/assets/js/app/pages/admin/matter-detail.js:955 |
| MTF-99 | زر | سحب من المحامي | public/assets/js/app/pages/admin/matter-detail.js:989 |
| MTF-100 | تنبيه | سجل الرسائل المرتبطة بهذا الملف، بما فيها التذكيرات الآلية بالجلسات و… | public/assets/js/app/pages/admin/matter-detail.js:1003 |
| MTF-101 | عنوان | السجل الزمني للملف المستمر | public/assets/js/app/pages/admin/matter-detail.js:1101 |
| MTF-102 | قسم/بطاقة | السجل الزمني للملف المستمر | public/assets/js/app/pages/admin/matter-detail.js:1101 |
| MTF-103 | خيار | (نص متغير) | public/assets/js/app/pages/admin/matter-detail.js:1104 |
| MTF-104 | تنبيه | الملف المستمر مغلق منذ … . يمكنك إعادة فتحه بتعديل الحالة. | public/assets/js/app/pages/admin/matter-detail.js:1108 |
| MTF-105 | عنصر قائمة | الجلسات والمواعيد | public/assets/js/app/pages/admin/matter-detail.js:1094 |
| MTF-106 | عنصر قائمة | المهام الإجرائية | public/assets/js/app/pages/admin/matter-detail.js:1095 |
| MTF-107 | عنصر قائمة | الفواتير والمدفوعات | public/assets/js/app/pages/admin/matter-detail.js:1096 |
| MTF-108 | عنصر قائمة | المصروفات | public/assets/js/app/pages/admin/matter-detail.js:1097 |
| MTF-109 | عنصر قائمة | أتعاب المحامي | public/assets/js/app/pages/admin/matter-detail.js:1098 |
| MTF-110 | عنصر قائمة | المستندات | public/assets/js/app/pages/admin/matter-detail.js:1099 |
| MTF-111 | عنصر قائمة | الرسائل | public/assets/js/app/pages/admin/matter-detail.js:1100 |
| MTF-112 | عنصر قائمة | السجل | public/assets/js/app/pages/admin/matter-detail.js:1101 |
| MTF-113 | عنصر قائمة | نوع الموعد | public/assets/js/app/pages/admin/matter-detail.js:225 |
| MTF-114 | عنصر قائمة | العنوان | public/assets/js/app/pages/admin/matter-detail.js:226 |
| MTF-115 | عنصر قائمة | التاريخ والوقت | public/assets/js/app/pages/admin/matter-detail.js:227 |
| MTF-116 | عنصر قائمة | المكان | public/assets/js/app/pages/admin/matter-detail.js:228 |
| MTF-117 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/matter-detail.js:229 |
| MTF-118 | عنصر قائمة | يلزم حضور | public/assets/js/app/pages/admin/matter-detail.js:236 |
| MTF-119 | عنصر قائمة | client_note | public/assets/js/app/pages/admin/matter-detail.js:239 |
| MTF-120 | عنصر قائمة | ما تم في الجلسة / القرار | public/assets/js/app/pages/admin/matter-detail.js:240 |
| MTF-121 | عنصر قائمة | ملاحظات | public/assets/js/app/pages/admin/matter-detail.js:241 |
| MTF-122 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/matter-detail.js:293 |
| MTF-123 | عنصر قائمة | موعد الجلسة التالية (اختياري) | public/assets/js/app/pages/admin/matter-detail.js:294 |
| MTF-124 | عنصر قائمة | ما تم في الجلسة / القرار | public/assets/js/app/pages/admin/matter-detail.js:295 |
| MTF-125 | عنصر قائمة | المهمة | public/assets/js/app/pages/admin/matter-detail.js:426 |
| MTF-126 | عنصر قائمة | الموعد | public/assets/js/app/pages/admin/matter-detail.js:427 |
| MTF-127 | عنصر قائمة | المسؤول عن المهمة | public/assets/js/app/pages/admin/matter-detail.js:428 |
| MTF-128 | عنصر قائمة | تفاصيل | public/assets/js/app/pages/admin/matter-detail.js:430 |
| MTF-129 | عنصر قائمة | المهمة | public/assets/js/app/pages/admin/matter-detail.js:451 |
| MTF-130 | عنصر قائمة | الموعد | public/assets/js/app/pages/admin/matter-detail.js:452 |
| MTF-131 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/matter-detail.js:453 |
| MTF-132 | عنصر قائمة | تفاصيل | public/assets/js/app/pages/admin/matter-detail.js:455 |
| MTF-133 | عنصر قائمة | البيان | public/assets/js/app/pages/admin/matter-detail.js:548 |
| MTF-134 | عنصر قائمة | المبلغ | public/assets/js/app/pages/admin/matter-detail.js:549 |
| MTF-135 | عنصر قائمة | تاريخ الاستحقاق | public/assets/js/app/pages/admin/matter-detail.js:550 |
| MTF-136 | عنصر قائمة | المبلغ المدفوع | public/assets/js/app/pages/admin/matter-detail.js:565 |
| MTF-137 | عنصر قائمة | تاريخ الدفع | public/assets/js/app/pages/admin/matter-detail.js:566 |
| MTF-138 | عنصر قائمة | طريقة الدفع | public/assets/js/app/pages/admin/matter-detail.js:567 |
| MTF-139 | عنصر قائمة | رقم مرجعي | public/assets/js/app/pages/admin/matter-detail.js:568 |
| MTF-140 | عنصر قائمة | البيان | public/assets/js/app/pages/admin/matter-detail.js:693 |
| MTF-141 | عنصر قائمة | المبلغ | public/assets/js/app/pages/admin/matter-detail.js:694 |
| MTF-142 | عنصر قائمة | التاريخ | public/assets/js/app/pages/admin/matter-detail.js:695 |
| MTF-143 | عنصر قائمة | من دفعها | public/assets/js/app/pages/admin/matter-detail.js:705 |
| MTF-144 | عنصر قائمة | المحامي الذي دفعها | public/assets/js/app/pages/admin/matter-detail.js:707 |
| MTF-145 | عنصر قائمة | المحامي | public/assets/js/app/pages/admin/matter-detail.js:773 |
| MTF-146 | عنصر قائمة | المبلغ | public/assets/js/app/pages/admin/matter-detail.js:774 |
| MTF-147 | عنصر قائمة | البيان | public/assets/js/app/pages/admin/matter-detail.js:775 |
| MTF-148 | عنصر قائمة | العنوان | public/assets/js/app/pages/admin/matter-detail.js:1048 |
| MTF-149 | عنصر قائمة | نوع الملف | public/assets/js/app/pages/admin/matter-detail.js:1049 |
| MTF-150 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/matter-detail.js:1050 |
| MTF-151 | عنصر قائمة | المحامي المسؤول | public/assets/js/app/pages/admin/matter-detail.js:1051 |
| MTF-152 | عنصر قائمة | الأتعاب المتفق عليها مع | public/assets/js/app/pages/admin/matter-detail.js:1052 |
| MTF-153 | عنصر قائمة | المحكمة | public/assets/js/app/pages/admin/matter-detail.js:1053 |
| MTF-154 | عنصر قائمة | الدائرة | public/assets/js/app/pages/admin/matter-detail.js:1054 |
| MTF-155 | عنصر قائمة | رقم الدعوى | public/assets/js/app/pages/admin/matter-detail.js:1055 |
| MTF-156 | عنصر قائمة | سنة الدعوى | public/assets/js/app/pages/admin/matter-detail.js:1056 |
| MTF-157 | عنصر قائمة | الخصم | public/assets/js/app/pages/admin/matter-detail.js:1057 |
| MTF-158 | عنصر قائمة | ملاحظات وتكليف المحامي | public/assets/js/app/pages/admin/matter-detail.js:1058 |
| MTF-159 | عنصر | (نص متغير) | public/assets/js/app/pages/admin/matter-detail.js:872 |
| MTF-160 | عنصر | (نص متغير) | public/assets/js/app/pages/admin/matter-detail.js:976 |
| MTF-161 | عنصر قائمة | المستند | public/assets/js/app/pages/admin/matter-detail.js:905 |
| MTF-162 | عنصر قائمة | التاريخ | public/assets/js/app/pages/admin/matter-detail.js:907 |
| MTF-163 | عنصر | (نص متغير) | public/assets/js/app/pages/admin/matter-detail.js:914 |
| MTF-164 | شارة | أُتيح للمحامي في الاستشارة | public/assets/js/app/pages/admin/matter-detail.js:915 |
| MTF-165 | زر | إتاحة للمحامي المسؤول | public/assets/js/app/pages/admin/matter-detail.js:927 |
| MTF-166 | عنصر قائمة | إجراءات | public/assets/js/app/pages/admin/matter-detail.js:931 |
| MTF-167 | جدول | المستند | public/assets/js/app/pages/admin/matter-detail.js:937 |
| MTF-168 | جدول | المستند | public/assets/js/app/pages/admin/matter-detail.js:938 |
| MTF-169 | عنوان | مستندات من الطلب والاستشارة | public/assets/js/app/pages/admin/matter-detail.js:940 |
| MTF-170 | قسم/بطاقة | مستندات من الطلب والاستشارة | public/assets/js/app/pages/admin/matter-detail.js:941 |

## OUT: نتيجة الجلسة وإغلاق الملف (يظهر في: نافذة نتيجة الجلسة وإغلاق الملف)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| OUT-01 | حقل | (نص متغير) | public/assets/js/app/components/outcome-sheet.js:121 |
| OUT-02 | زر | (نص متغير) | public/assets/js/app/components/outcome-sheet.js:127 |
| OUT-03 | زر | حفظ النتيجة | public/assets/js/app/components/outcome-sheet.js:173 |
| OUT-04 | خيار | ماذا قررت المحكمة؟ | public/assets/js/app/components/outcome-sheet.js:189 |
| OUT-05 | حقل | (نص متغير) | public/assets/js/app/components/outcome-sheet.js:215 |
| OUT-06 | حقل | (نص متغير) | public/assets/js/app/components/outcome-sheet.js:226 |
| OUT-07 | زر | تغيير الساعة | public/assets/js/app/components/outcome-sheet.js:229 |
| OUT-08 | حقل | (نص متغير) | public/assets/js/app/components/outcome-sheet.js:259 |
| OUT-09 | خيار | (نص متغير) | public/assets/js/app/components/outcome-sheet.js:278 |
| OUT-10 | حقل | مثال: حكمت المحكمة بالبراءة. | public/assets/js/app/components/outcome-sheet.js:300 |
| OUT-11 | حقل | (نص متغير) | public/assets/js/app/components/outcome-sheet.js:305 |
| OUT-12 | نافذة | تجاهل ما أدخلته؟ | public/assets/js/app/components/outcome-sheet.js:435 |
| OUT-13 | نافذة | تجاهل ما أدخلته؟ | public/assets/js/app/components/outcome-sheet.js:438 |
| OUT-14 | حقل | (نص متغير) | public/assets/js/app/components/outcome-sheet.js:465 |
| OUT-15 | حقل | (نص متغير) | public/assets/js/app/components/outcome-sheet.js:477 |
| OUT-16 | حقل | مثال: محكمة الأسرة ببنها | public/assets/js/app/components/outcome-sheet.js:483 |
| OUT-17 | زر | تغيير | public/assets/js/app/components/outcome-sheet.js:493 |
| OUT-18 | حقل | (نص متغير) | public/assets/js/app/components/outcome-sheet.js:503 |
| OUT-19 | حقل | (نص متغير) | public/assets/js/app/components/outcome-sheet.js:517 |
| OUT-20 | زر | إضافة الجلسة | public/assets/js/app/components/outcome-sheet.js:525 |
| OUT-21 | نافذة | تجاهل ما أدخلته؟ | public/assets/js/app/components/outcome-sheet.js:574 |
| OUT-22 | نافذة | إضافة جلسة | public/assets/js/app/components/outcome-sheet.js:577 |
| OUT-23 | حقل | (نص متغير) | public/assets/js/app/components/outcome-sheet.js:593 |
| OUT-24 | حقل | (نص متغير) | public/assets/js/app/components/outcome-sheet.js:600 |
| OUT-25 | حقل | (نص متغير) | public/assets/js/app/components/outcome-sheet.js:602 |
| OUT-26 | زر | حفظ الموعد | public/assets/js/app/components/outcome-sheet.js:604 |
| OUT-27 | نافذة | تجاهل ما أدخلته؟ | public/assets/js/app/components/outcome-sheet.js:636 |
| OUT-28 | نافذة | تعديل الموعد | public/assets/js/app/components/outcome-sheet.js:638 |
| OUT-29 | زر | تسجيل الأثر | public/assets/js/app/components/outcome.js:52 |
| OUT-30 | عنوان | (نص متغير) | public/assets/js/app/components/outcome.js:53 |
| OUT-31 | قسم/بطاقة | الحقوق التي استردها المستفيد بفضل الخدمة | public/assets/js/app/components/outcome.js:53 |
| OUT-32 | حالة فارغة | لم يُسجَّل الأثر المتحقق لهذا الملف بعد. سجّله ليُحتسب في تقرير الأثر. | public/assets/js/app/components/outcome.js:75 |
| OUT-33 | نافذة | سجّل ما استرده … فعليًا (بالجنيه المصري). القيمة السنوية = الدفعة الو… | public/assets/js/app/components/outcome.js:110 |
| OUT-34 | عنصر قائمة | outcome_kind | public/assets/js/app/components/outcome.js:24 |
| OUT-35 | عنصر قائمة | حقوق مستردة دفعة واحدة | public/assets/js/app/components/outcome.js:26 |
| OUT-36 | عنصر قائمة | حقوق شهرية مستردة | public/assets/js/app/components/outcome.js:27 |
| OUT-37 | عنصر قائمة | ملاحظات الأثر | public/assets/js/app/components/outcome.js:28 |
| OUT-38 | عنصر قائمة | للاطلاع | public/assets/js/app/components/outcome-sheet.js:32 |
| OUT-39 | عنصر قائمة | لتقديم مستندات | public/assets/js/app/components/outcome-sheet.js:33 |
| OUT-40 | عنصر قائمة | للإعلان | public/assets/js/app/components/outcome-sheet.js:34 |
| OUT-41 | عنصر قائمة | للمرافعة | public/assets/js/app/components/outcome-sheet.js:35 |
| OUT-42 | عنصر قائمة | للخبير | public/assets/js/app/components/outcome-sheet.js:36 |
| OUT-43 | عنصر قائمة | إداريًا | public/assets/js/app/components/outcome-sheet.js:37 |
| OUT-44 | عنصر قائمة | شُطبت | public/assets/js/app/components/outcome-sheet.js:40 |
| OUT-45 | عنصر قائمة | لم تنعقد | public/assets/js/app/components/outcome-sheet.js:41 |
| OUT-46 | عنصر قائمة | سبب آخر | public/assets/js/app/components/outcome-sheet.js:42 |

## CLI: المستفيدون (`/app#/clients`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CLI-01 | حالة فارغة | لا يوجد مستفيد/ة مطابق لهذا البحث | public/assets/js/app/pages/admin/clients.js:48 |
| CLI-02 | زر | بدون اسم | public/assets/js/app/pages/admin/clients.js:62 |
| CLI-03 | حقل | بحث عن مستفيد/ة | public/assets/js/app/pages/admin/clients.js:96 |
| CLI-04 | عنصر قائمة | إلغاء | public/assets/js/app/pages/admin/clients.js:101 |
| CLI-05 | عنصر قائمة | اختر مستفيدًا من نتائج البحث أولًا | public/assets/js/app/pages/admin/clients.js:113 |
| CLI-06 | نافذة | ابحث بالاسم أو كود المستفيد/ة أو رقم الهاتف… | public/assets/js/app/pages/admin/clients.js:117 |
| CLI-07 | زر | مسح البحث | public/assets/js/app/pages/admin/clients.js:164 |
| CLI-08 | حالة فارغة | لا يوجد مستفيد/ة مطابق لهذا البحث | public/assets/js/app/pages/admin/clients.js:166 |
| CLI-09 | قسم/بطاقة | لا يوجد مستفيد/ة مطابق لهذا البحث | public/assets/js/app/pages/admin/clients.js:168 |
| CLI-10 | رابط | (نص متغير) | public/assets/js/app/pages/admin/clients.js:182 |
| CLI-11 | عنصر قائمة | كود المستفيد/ة | public/assets/js/app/pages/admin/clients.js:182 |
| CLI-12 | عنصر قائمة | الاسم | public/assets/js/app/pages/admin/clients.js:189 |
| CLI-13 | عنصر قائمة | الهاتف | public/assets/js/app/pages/admin/clients.js:191 |
| CLI-14 | عنصر قائمة | الطلبات | public/assets/js/app/pages/admin/clients.js:192 |
| CLI-15 | عنصر قائمة | ملفات الاستشارة | public/assets/js/app/pages/admin/clients.js:193 |
| CLI-16 | عنصر قائمة | ملفات مفتوحة | public/assets/js/app/pages/admin/clients.js:194 |
| CLI-17 | عنصر قائمة | ملفات مستمرة | public/assets/js/app/pages/admin/clients.js:195 |
| CLI-18 | عنصر قائمة | آخر تواصل | public/assets/js/app/pages/admin/clients.js:201 |
| CLI-19 | جدول | قائمة المستفيدين | public/assets/js/app/pages/admin/clients.js:205 |
| CLI-20 | جدول | قائمة المستفيدين | public/assets/js/app/pages/admin/clients.js:206 |
| CLI-21 | زر | عرض المزيد (… ) | public/assets/js/app/pages/admin/clients.js:218 |
| CLI-22 | عنصر قائمة | لوحة المتابعة | public/assets/js/app/pages/admin/clients.js:230 |
| CLI-23 | عنوان | أصحاب الطلبات | public/assets/js/app/pages/admin/clients.js:236 |
| CLI-24 | عنوان | أصحاب الطلبات | public/assets/js/app/pages/admin/clients.js:237 |
| CLI-25 | حقل | بحث في المستفيدين | public/assets/js/app/pages/admin/clients.js:248 |

## CLF: ملف المستفيد/ة (`/app#/clients/`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CLF-01 | عنصر قائمة | أصحاب الطلبات | public/assets/js/app/pages/admin/client-detail.js:46 |
| CLF-02 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/client-detail.js:46 |
| CLF-03 | عنوان | أصحاب الطلبات | public/assets/js/app/pages/admin/client-detail.js:46 |
| CLF-04 | زر | فتح صفحة الشركة | public/assets/js/app/pages/admin/client-detail.js:52 |
| CLF-05 | قسم/بطاقة | هذا حساب داخلي لشركة عميلة — … | public/assets/js/app/pages/admin/client-detail.js:54 |
| CLF-06 | عنصر قائمة | الاسم | public/assets/js/app/pages/admin/client-detail.js:87 |
| CLF-07 | عنصر قائمة | طريقة المخاطبة | public/assets/js/app/pages/admin/client-detail.js:100 |
| CLF-08 | عنصر قائمة | الرقم القومي | public/assets/js/app/pages/admin/client-detail.js:102 |
| CLF-09 | عنصر قائمة | المحافظة | public/assets/js/app/pages/admin/client-detail.js:103 |
| CLF-10 | عنصر قائمة | البريد الإلكتروني | public/assets/js/app/pages/admin/client-detail.js:104 |
| CLF-11 | عنصر قائمة | ملاحظات داخلية | public/assets/js/app/pages/admin/client-detail.js:105 |
| CLF-12 | نافذة | تعديل بيانات المستفيد/ة | public/assets/js/app/pages/admin/client-detail.js:119 |
| CLF-13 | عنصر قائمة | النوع | public/assets/js/app/pages/admin/client-detail.js:143 |
| CLF-14 | عنصر قائمة | الرقم أو البريد | public/assets/js/app/pages/admin/client-detail.js:145 |
| CLF-15 | نافذة | إضافة وسيلة تواصل | public/assets/js/app/pages/admin/client-detail.js:159 |
| CLF-16 | نافذة | تأكيد الدمج | public/assets/js/app/pages/admin/client-detail.js:187 |
| CLF-17 | حقل | (نص متغير) | public/assets/js/app/pages/admin/client-detail.js:208 |
| CLF-18 | زر | نسخ | public/assets/js/app/pages/admin/client-detail.js:209 |
| CLF-19 | زر | إنشاء رابط | public/assets/js/app/pages/admin/client-detail.js:222 |
| CLF-20 | نافذة | إرسال رابط البوابة للمستفيد/ة | public/assets/js/app/pages/admin/client-detail.js:231 |
| CLF-21 | زر | إرسال عبر واتساب | public/assets/js/app/pages/admin/client-detail.js:238 |
| CLF-22 | زر | تعديل | public/assets/js/app/pages/admin/client-detail.js:246 |
| CLF-23 | عنوان | بيانات المستفيد/ة | public/assets/js/app/pages/admin/client-detail.js:257 |
| CLF-24 | قسم/بطاقة | بيانات المستفيد/ة | public/assets/js/app/pages/admin/client-detail.js:258 |
| CLF-25 | زر | إضافة | public/assets/js/app/pages/admin/client-detail.js:267 |
| CLF-26 | حالة فارغة | لا توجد وسائل تواصل مسجلة | public/assets/js/app/pages/admin/client-detail.js:280 |
| CLF-27 | عنوان | وسائل التواصل | public/assets/js/app/pages/admin/client-detail.js:281 |
| CLF-28 | قسم/بطاقة | وسائل التواصل | public/assets/js/app/pages/admin/client-detail.js:282 |
| CLF-29 | نافذة | إلغاء روابط البوابة | public/assets/js/app/pages/admin/client-detail.js:292 |
| CLF-30 | زر | إلغاء روابط البوابة | public/assets/js/app/pages/admin/client-detail.js:314 |
| CLF-31 | عنوان | صفحة المتابعة | public/assets/js/app/pages/admin/client-detail.js:317 |
| CLF-32 | قسم/بطاقة | صفحة المتابعة | public/assets/js/app/pages/admin/client-detail.js:318 |
| CLF-33 | زر | (نص متغير) | public/assets/js/app/pages/admin/client-detail.js:329 |
| CLF-34 | عنوان | ملف مكرر؟ | public/assets/js/app/pages/admin/client-detail.js:331 |
| CLF-35 | قسم/بطاقة | ملف مكرر؟ | public/assets/js/app/pages/admin/client-detail.js:332 |
| CLF-36 | رابط | طلب وارد | public/assets/js/app/pages/admin/client-detail.js:343 |
| CLF-37 | رابط | ملف استشارة | public/assets/js/app/pages/admin/client-detail.js:358 |
| CLF-38 | رابط | ملف مستمر | public/assets/js/app/pages/admin/client-detail.js:376 |
| CLF-39 | عنوان | تاريخ العلاقة مع المؤسسة | public/assets/js/app/pages/admin/client-detail.js:395 |
| CLF-40 | قسم/بطاقة | تاريخ العلاقة مع المؤسسة | public/assets/js/app/pages/admin/client-detail.js:396 |
| CLF-41 | عنصر قائمة | رقم الفاتورة | public/assets/js/app/pages/admin/client-detail.js:412 |
| CLF-42 | عنصر قائمة | البيان | public/assets/js/app/pages/admin/client-detail.js:413 |
| CLF-43 | عنصر قائمة | المبلغ | public/assets/js/app/pages/admin/client-detail.js:414 |
| CLF-44 | عنصر قائمة | الاستحقاق | public/assets/js/app/pages/admin/client-detail.js:420 |
| CLF-45 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/client-detail.js:422 |
| CLF-46 | جدول | فواتير المستفيد/ة | public/assets/js/app/pages/admin/client-detail.js:425 |
| CLF-47 | جدول | فواتير المستفيد/ة | public/assets/js/app/pages/admin/client-detail.js:426 |
| CLF-48 | حالة فارغة | لا توجد فواتير لهذا المستفيد/ة | public/assets/js/app/pages/admin/client-detail.js:428 |
| CLF-49 | عنوان | الفواتير | public/assets/js/app/pages/admin/client-detail.js:429 |
| CLF-50 | قسم/بطاقة | الفواتير | public/assets/js/app/pages/admin/client-detail.js:430 |
| CLF-51 | عنوان | سجل النشاط | public/assets/js/app/pages/admin/client-detail.js:441 |
| CLF-52 | قسم/بطاقة | سجل النشاط | public/assets/js/app/pages/admin/client-detail.js:441 |
| CLF-53 | بطاقة رقم | الطلبات الواردة | public/assets/js/app/pages/admin/client-detail.js:454 |
| CLF-54 | بطاقة رقم | ملفات الاستشارة | public/assets/js/app/pages/admin/client-detail.js:455 |
| CLF-55 | بطاقة رقم | الملفات المستمرة | public/assets/js/app/pages/admin/client-detail.js:456 |
| CLF-56 | بطاقة رقم | فواتير غير مسددة | public/assets/js/app/pages/admin/client-detail.js:462 |
| CLF-57 | عنصر قائمة | أصحاب الطلبات | public/assets/js/app/pages/admin/client-detail.js:470 |
| CLF-58 | زر | تعديل البيانات | public/assets/js/app/pages/admin/client-detail.js:478 |
| CLF-59 | زر | (نص متغير) | public/assets/js/app/pages/admin/client-detail.js:479 |
| CLF-60 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/client-detail.js:481 |
| CLF-61 | عنوان | بدون اسم | public/assets/js/app/pages/admin/client-detail.js:482 |
| CLF-62 | حقل | (نص متغير) | public/assets/js/app/components/beneficiary.js:35 |
| CLF-63 | حقل | — النوع — | public/assets/js/app/components/beneficiary.js:38 |
| CLF-64 | زر | حذف هذا السطر | public/assets/js/app/components/beneficiary.js:55 |
| CLF-65 | زر | إضافة ابن أو ابنة | public/assets/js/app/components/beneficiary.js:71 |
| CLF-66 | عنصر قائمة | إلغاء | public/assets/js/app/components/beneficiary.js:139 |
| CLF-67 | عنصر قائمة | حفظ البطاقة | public/assets/js/app/components/beneficiary.js:179 |
| CLF-68 | نافذة | تعديل بطاقة المستفيد | public/assets/js/app/components/beneficiary.js:182 |
| CLF-69 | سؤال قابل للفتح | كيف حُسبت الدرجة؟ | public/assets/js/app/components/beneficiary.js:199 |
| CLF-70 | عنوان | كيف حُسبت الدرجة؟ | public/assets/js/app/components/beneficiary.js:199 |
| CLF-71 | عنوان | بطاقة المستفيد | public/assets/js/app/components/beneficiary.js:220 |
| CLF-72 | قسم/بطاقة | بطاقة المستفيد | public/assets/js/app/components/beneficiary.js:221 |
| CLF-73 | زر | تُملأ الحقول الفارغة فقط ولا يُستبدل ما سجلته الإدارة | public/assets/js/app/components/beneficiary.js:262 |
| CLF-74 | زر | تعديل | public/assets/js/app/components/beneficiary.js:272 |
| CLF-75 | زر | تأكيد التحقق | public/assets/js/app/components/beneficiary.js:283 |
| CLF-76 | تنبيه | اقتراح أولوية | public/assets/js/app/components/beneficiary.js:292 |
| CLF-77 | زر | تطبيق الأولوية المقترحة | public/assets/js/app/components/beneficiary.js:301 |
| CLF-78 | زر | إضافة البيانات | public/assets/js/app/components/beneficiary.js:315 |
| CLF-79 | حالة فارغة | لم تُسجَّل بيانات البحث الاجتماعي لهذه الأسرة بعد. تساعد البطاقة في ت… | public/assets/js/app/components/beneficiary.js:316 |
| CLF-80 | عنصر قائمة | صفة المستفيد | public/assets/js/app/components/beneficiary.js:107 |
| CLF-81 | عنصر قائمة | عدد الأبناء | public/assets/js/app/components/beneficiary.js:108 |
| CLF-82 | عنصر قائمة | الدخل الشهري للأسرة | public/assets/js/app/components/beneficiary.js:109 |
| CLF-83 | عنصر قائمة | السكن | public/assets/js/app/components/beneficiary.js:110 |
| CLF-84 | عنصر قائمة | العمل | public/assets/js/app/components/beneficiary.js:111 |
| CLF-85 | عنصر قائمة | رقم الملف لدى المؤسسة | public/assets/js/app/components/beneficiary.js:112 |
| CLF-86 | عنصر قائمة | الأسرة مستفيدة من برامج المؤسسة الأخرى | public/assets/js/app/components/beneficiary.js:113 |
| CLF-87 | عنصر قائمة | في الأسرة إعاقة أو مرض مزمن | public/assets/js/app/components/beneficiary.js:114 |
| CLF-88 | عنصر قائمة | ملاحظات البحث الاجتماعي | public/assets/js/app/components/beneficiary.js:115 |
| CLF-89 | عنصر قائمة | تم التحقق من هذه البيانات (زيارة أو مستندات أو بحث اجتماعي) | public/assets/js/app/components/beneficiary.js:122 |
| CLF-90 | نموذج | صفة المستفيد | public/assets/js/app/components/beneficiary.js:129 |

## LWL: شبكة المحامين (`/app#/lawyers`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| LWL-01 | عنصر | شهر المؤشرات | public/assets/js/app/pages/admin/lawyers.js:724 |
| LWL-02 | تنبيه | (نص متغير) | public/assets/js/app/pages/admin/lawyers.js:282 |
| LWL-03 | عنوان | البيانات الأساسية | public/assets/js/app/pages/admin/lawyers.js:417 |
| LWL-04 | عنوان | اتفاق المحاسبة | public/assets/js/app/pages/admin/lawyers.js:419 |
| LWL-05 | عنصر قائمة | إلغاء | public/assets/js/app/pages/admin/lawyers.js:429 |
| LWL-06 | عنصر قائمة | إضافة المحامي | public/assets/js/app/pages/admin/lawyers.js:476 |
| LWL-07 | نافذة | إضافة محامٍ إلى الشبكة | public/assets/js/app/pages/admin/lawyers.js:479 |
| LWL-08 | رابط | (نص متغير) | public/assets/js/app/pages/admin/lawyers.js:516 |
| LWL-09 | رابط | ملف … | public/assets/js/app/pages/admin/lawyers.js:538 |
| LWL-10 | بطاقة رقم | المحامون النشطون | public/assets/js/app/pages/admin/lawyers.js:597 |
| LWL-11 | بطاقة رقم | الإسنادات المفتوحة مقابل الطاقة | public/assets/js/app/pages/admin/lawyers.js:604 |
| LWL-12 | بطاقة رقم | إسنادات متأخرة | public/assets/js/app/pages/admin/lawyers.js:612 |
| LWL-13 | بطاقة رقم | إسنادات مُنجزة ومعتمدة | public/assets/js/app/pages/admin/lawyers.js:614 |
| LWL-14 | بطاقة رقم | استشارات تطوعية | public/assets/js/app/pages/admin/lawyers.js:615 |
| LWL-15 | زر | مسح التصفية | public/assets/js/app/pages/admin/lawyers.js:639 |
| LWL-16 | زر | إضافة محامٍ | public/assets/js/app/pages/admin/lawyers.js:640 |
| LWL-17 | حالة فارغة | لا يوجد محامون مطابقون للتصفية الحالية | public/assets/js/app/pages/admin/lawyers.js:641 |
| LWL-18 | قسم/بطاقة | لا يوجد محامون مطابقون للتصفية الحالية | public/assets/js/app/pages/admin/lawyers.js:643 |
| LWL-19 | عنصر قائمة | المحامي والتخصصات | public/assets/js/app/pages/admin/lawyers.js:656 |
| LWL-20 | عنصر قائمة | الاتفاق | public/assets/js/app/pages/admin/lawyers.js:657 |
| LWL-21 | عنصر قائمة | الحمل الحالي | public/assets/js/app/pages/admin/lawyers.js:658 |
| LWL-22 | عنصر قائمة | السرعة والتأخير | public/assets/js/app/pages/admin/lawyers.js:668 |
| LWL-23 | عنصر قائمة | المنجز في الشهر | public/assets/js/app/pages/admin/lawyers.js:679 |
| LWL-24 | عنصر قائمة | الجودة | public/assets/js/app/pages/admin/lawyers.js:692 |
| LWL-25 | جدول | قائمة محامي الشبكة ومؤشرات أدائهم | public/assets/js/app/pages/admin/lawyers.js:695 |
| LWL-26 | جدول | قائمة محامي الشبكة ومؤشرات أدائهم | public/assets/js/app/pages/admin/lawyers.js:696 |
| LWL-27 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/lawyers.js:700 |
| LWL-28 | حقل | التخصص | public/assets/js/app/pages/admin/lawyers.js:720 |
| LWL-29 | حقل | حالة الحساب | public/assets/js/app/pages/admin/lawyers.js:744 |
| LWL-30 | حقل | بحث في المحامين | public/assets/js/app/pages/admin/lawyers.js:753 |
| LWL-31 | عنصر قائمة | لوحة المتابعة | public/assets/js/app/pages/admin/lawyers.js:783 |
| LWL-32 | زر | إضافة محامٍ | public/assets/js/app/pages/admin/lawyers.js:784 |
| LWL-33 | عنوان | شبكة المحامين | public/assets/js/app/pages/admin/lawyers.js:785 |
| LWL-34 | عنوان | شبكة المحامين | public/assets/js/app/pages/admin/lawyers.js:786 |
| LWL-35 | عنصر قائمة | نوع الاتفاق | public/assets/js/app/pages/admin/lawyers.js:238 |
| LWL-36 | نموذج | نوع الاتفاق | public/assets/js/app/pages/admin/lawyers.js:241 |
| LWL-37 | نموذج | (نص متغير) | public/assets/js/app/pages/admin/lawyers.js:252 |
| LWL-38 | عنصر قائمة | اسم المحامي | public/assets/js/app/pages/admin/lawyers.js:333 |
| LWL-39 | عنصر قائمة | اللقب | public/assets/js/app/pages/admin/lawyers.js:334 |
| LWL-40 | عنصر قائمة | اسم المستخدم للدخول | public/assets/js/app/pages/admin/lawyers.js:344 |
| LWL-41 | عنصر قائمة | طريقة تفعيل الحساب | public/assets/js/app/pages/admin/lawyers.js:362 |
| LWL-42 | عنصر قائمة | كلمة المرور المؤقتة | public/assets/js/app/pages/admin/lawyers.js:364 |
| LWL-43 | عنصر قائمة | رقم الموبايل | public/assets/js/app/pages/admin/lawyers.js:365 |
| LWL-44 | عنصر قائمة | البريد الإلكتروني | public/assets/js/app/pages/admin/lawyers.js:366 |
| LWL-45 | عنصر قائمة | رقم القيد بالنقابة | public/assets/js/app/pages/admin/lawyers.js:367 |
| LWL-46 | عنصر قائمة | درجة القيد | public/assets/js/app/pages/admin/lawyers.js:368 |
| LWL-47 | عنصر قائمة | مكتب المحاماة (إن وُجد) | public/assets/js/app/pages/admin/lawyers.js:369 |
| LWL-48 | عنصر قائمة | الطاقة الاستيعابية | public/assets/js/app/pages/admin/lawyers.js:380 |
| LWL-49 | عنصر قائمة | التخصصات | public/assets/js/app/pages/admin/lawyers.js:382 |
| LWL-50 | عنصر قائمة | ملاحظات داخلية | public/assets/js/app/pages/admin/lawyers.js:383 |
| LWL-51 | نموذج | اسم المحامي | public/assets/js/app/pages/admin/lawyers.js:401 |
| LWL-52 | عنصر قائمة | اسم مكتب المحاماة | public/assets/js/app/pages/admin/lawyers.js:187 |
| LWL-53 | عنصر قائمة | فترة الالتزام | public/assets/js/app/pages/admin/lawyers.js:198 |
| LWL-54 | عنصر قائمة | عدد الساعات الملتزم بها | public/assets/js/app/pages/admin/lawyers.js:201 |
| LWL-55 | خيار | متى تُستحق الأتعاب؟ | public/assets/js/app/pages/admin/lawyers.js:162 |
| LWL-56 | عنصر | أجر الاستشارة المعتمدة | public/assets/js/app/pages/admin/lawyers.js:166 |
| LWL-57 | عنصر | المبلغ الشهري الثابت | public/assets/js/app/pages/admin/lawyers.js:168 |
| LWL-58 | عنصر | المبلغ الشهري | public/assets/js/app/pages/admin/lawyers.js:171 |
| LWL-59 | عنصر | عدد الاستشارات المشمولة شهريًا | public/assets/js/app/pages/admin/lawyers.js:172 |
| LWL-60 | عنصر | سعر الاستشارة الزائدة على الحصة | public/assets/js/app/pages/admin/lawyers.js:173 |
| LWL-61 | عنصر | عدد استشارات الباقة | public/assets/js/app/pages/admin/lawyers.js:178 |
| LWL-62 | عنصر | قيمة الباقة | public/assets/js/app/pages/admin/lawyers.js:179 |
| LWL-63 | عنصر | سعر الاستشارة بعد نفاد الباقة | public/assets/js/app/pages/admin/lawyers.js:180 |
| LWL-64 | عنصر | القيمة التقديرية للاستشارة | public/assets/js/app/pages/admin/lawyers.js:184 |
| LWL-65 | عنصر | عدد الاستشارات الملتزم بها | public/assets/js/app/pages/admin/lawyers.js:200 |
| LWL-66 | عنصر | القيمة التقديرية للاستشارة | public/assets/js/app/pages/admin/lawyers.js:202 |

## LWF: ملف المحامي (`/app#/lawyers/`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| LWF-01 | زر | تعديل البيانات والاتفاق | public/assets/js/app/pages/admin/lawyer-detail.js:96 |
| LWF-02 | عنصر قائمة | عدد استشارات الباقة الجديدة | public/assets/js/app/pages/admin/lawyer-detail.js:109 |
| LWF-03 | عنصر قائمة | قيمة الباقة | public/assets/js/app/pages/admin/lawyer-detail.js:110 |
| LWF-04 | نافذة | تجديد باقة المحامي | public/assets/js/app/pages/admin/lawyer-detail.js:114 |
| LWF-05 | زر | تجديد الباقة | public/assets/js/app/pages/admin/lawyer-detail.js:121 |
| LWF-06 | عنصر قائمة | كلمة المرور المؤقتة | public/assets/js/app/pages/admin/lawyer-detail.js:134 |
| LWF-07 | عنصر قائمة | تأكيد كلمة المرور | public/assets/js/app/pages/admin/lawyer-detail.js:135 |
| LWF-08 | نافذة | تعيين كلمة مرور مؤقتة | public/assets/js/app/pages/admin/lawyer-detail.js:146 |
| LWF-09 | زر | كلمة مرور مؤقتة | public/assets/js/app/pages/admin/lawyer-detail.js:153 |
| LWF-10 | نافذة | إيقاف حساب المحامي | public/assets/js/app/pages/admin/lawyer-detail.js:168 |
| LWF-11 | نافذة | تفعيل حساب المحامي | public/assets/js/app/pages/admin/lawyer-detail.js:174 |
| LWF-12 | زر | إيقاف الحساب | public/assets/js/app/pages/admin/lawyer-detail.js:182 |
| LWF-13 | بطاقة رقم | الإسنادات المفتوحة | public/assets/js/app/pages/admin/lawyer-detail.js:200 |
| LWF-14 | بطاقة رقم | متأخرة الآن | public/assets/js/app/pages/admin/lawyer-detail.js:202 |
| LWF-15 | بطاقة رقم | تقديمات بعد الموعد | public/assets/js/app/pages/admin/lawyer-detail.js:203 |
| LWF-16 | بطاقة رقم | متوسط زمن أول تقديم | public/assets/js/app/pages/admin/lawyer-detail.js:204 |
| LWF-17 | بطاقة رقم | إسنادات معتمدة | public/assets/js/app/pages/admin/lawyer-detail.js:205 |
| LWF-18 | بطاقة رقم | نسبة الإعادة للتعديل | public/assets/js/app/pages/admin/lawyer-detail.js:206 |
| LWF-19 | بطاقة رقم | متوسط الجودة | public/assets/js/app/pages/admin/lawyer-detail.js:207 |
| LWF-20 | بطاقة رقم | رضا المستفيدين | public/assets/js/app/pages/admin/lawyer-detail.js:210 |
| LWF-21 | بطاقة رقم | استشارات تطوعية | public/assets/js/app/pages/admin/lawyer-detail.js:211 |
| LWF-22 | بطاقة رقم | المستحق عن الشهر | public/assets/js/app/pages/admin/lawyer-detail.js:215 |
| LWF-23 | بطاقة رقم | رصيد غير مصروف | public/assets/js/app/pages/admin/lawyer-detail.js:223 |
| LWF-24 | عنوان | مؤشرات الأداء | public/assets/js/app/pages/admin/lawyer-detail.js:242 |
| LWF-25 | قسم/بطاقة | مؤشرات الأداء | public/assets/js/app/pages/admin/lawyer-detail.js:243 |
| LWF-26 | رابط | (نص متغير) | public/assets/js/app/pages/admin/lawyer-detail.js:267 |
| LWF-27 | عنصر قائمة | الملف | public/assets/js/app/pages/admin/lawyer-detail.js:268 |
| LWF-28 | عنصر قائمة | الدور | public/assets/js/app/pages/admin/lawyer-detail.js:270 |
| LWF-29 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/lawyer-detail.js:280 |
| LWF-30 | عنصر قائمة | الموعد المطلوب | public/assets/js/app/pages/admin/lawyer-detail.js:286 |
| LWF-31 | عنصر قائمة | التواريخ | public/assets/js/app/pages/admin/lawyer-detail.js:302 |
| LWF-32 | جدول | إسنادات المحامي | public/assets/js/app/pages/admin/lawyer-detail.js:305 |
| LWF-33 | جدول | إسنادات المحامي | public/assets/js/app/pages/admin/lawyer-detail.js:306 |
| LWF-34 | زر | (نص متغير) | public/assets/js/app/pages/admin/lawyer-detail.js:327 |
| LWF-35 | رابط | (نص متغير) | public/assets/js/app/pages/admin/lawyer-detail.js:346 |
| LWF-36 | عنصر قائمة | الكود | public/assets/js/app/pages/admin/lawyer-detail.js:346 |
| LWF-37 | عنصر قائمة | الموضوع | public/assets/js/app/pages/admin/lawyer-detail.js:347 |
| LWF-38 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/lawyer-detail.js:348 |
| LWF-39 | جدول | الملفات المستمرة التي يتولاها المحامي | public/assets/js/app/pages/admin/lawyer-detail.js:350 |
| LWF-40 | جدول | الملفات المستمرة التي يتولاها المحامي | public/assets/js/app/pages/admin/lawyer-detail.js:351 |
| LWF-41 | بطاقة رقم | رصيد غير مصروف | public/assets/js/app/pages/admin/lawyer-detail.js:363 |
| LWF-42 | بطاقة رقم | إجمالي ما صُرف | public/assets/js/app/pages/admin/lawyer-detail.js:364 |
| LWF-43 | بطاقة رقم | مساهمات تطوعية | public/assets/js/app/pages/admin/lawyer-detail.js:365 |
| LWF-44 | بطاقة رقم | المتبقي في الباقة | public/assets/js/app/pages/admin/lawyer-detail.js:366 |
| LWF-45 | قسم/بطاقة | قيود الحساب | public/assets/js/app/pages/admin/lawyer-detail.js:370 |
| LWF-46 | عنوان | قيود الحساب | public/assets/js/app/pages/admin/lawyer-detail.js:370 |
| LWF-47 | زر | فتح في دفتر المستحقات | public/assets/js/app/pages/admin/lawyer-detail.js:370 |
| LWF-48 | عنصر قائمة | التاريخ | public/assets/js/app/pages/admin/lawyer-detail.js:377 |
| LWF-49 | عنصر قائمة | النوع | public/assets/js/app/pages/admin/lawyer-detail.js:378 |
| LWF-50 | عنصر قائمة | البيان | public/assets/js/app/pages/admin/lawyer-detail.js:379 |
| LWF-51 | رابط | (نص متغير) | public/assets/js/app/pages/admin/lawyer-detail.js:387 |
| LWF-52 | رابط | (نص متغير) | public/assets/js/app/pages/admin/lawyer-detail.js:388 |
| LWF-53 | عنصر قائمة | الملف | public/assets/js/app/pages/admin/lawyer-detail.js:391 |
| LWF-54 | عنصر قائمة | الفترة | public/assets/js/app/pages/admin/lawyer-detail.js:393 |
| LWF-55 | عنصر قائمة | المبلغ | public/assets/js/app/pages/admin/lawyer-detail.js:394 |
| LWF-56 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/lawyer-detail.js:395 |
| LWF-57 | جدول | قيود حساب المحامي | public/assets/js/app/pages/admin/lawyer-detail.js:397 |
| LWF-58 | جدول | قيود حساب المحامي | public/assets/js/app/pages/admin/lawyer-detail.js:398 |
| LWF-59 | قسم/بطاقة | وقائع الاستحقاق | public/assets/js/app/pages/admin/lawyer-detail.js:403 |
| LWF-60 | عنوان | وقائع الاستحقاق | public/assets/js/app/pages/admin/lawyer-detail.js:403 |
| LWF-61 | عنصر قائمة | التاريخ | public/assets/js/app/pages/admin/lawyer-detail.js:410 |
| LWF-62 | رابط | (نص متغير) | public/assets/js/app/pages/admin/lawyer-detail.js:414 |
| LWF-63 | عنصر قائمة | الملف | public/assets/js/app/pages/admin/lawyer-detail.js:415 |
| LWF-64 | عنصر قائمة | الدور | public/assets/js/app/pages/admin/lawyer-detail.js:417 |
| LWF-65 | عنصر قائمة | المعالجة المالية | public/assets/js/app/pages/admin/lawyer-detail.js:418 |
| LWF-66 | عنصر قائمة | المبلغ المستحق | public/assets/js/app/pages/admin/lawyer-detail.js:419 |
| LWF-67 | عنصر قائمة | القيمة التقديرية | public/assets/js/app/pages/admin/lawyer-detail.js:420 |
| LWF-68 | جدول | وقائع الاستحقاق | public/assets/js/app/pages/admin/lawyer-detail.js:422 |
| LWF-69 | جدول | وقائع الاستحقاق | public/assets/js/app/pages/admin/lawyer-detail.js:423 |
| LWF-70 | قسم/بطاقة | عمليات الصرف | public/assets/js/app/pages/admin/lawyer-detail.js:428 |
| LWF-71 | عنوان | عمليات الصرف | public/assets/js/app/pages/admin/lawyer-detail.js:428 |
| LWF-72 | عنصر قائمة | تاريخ الصرف | public/assets/js/app/pages/admin/lawyer-detail.js:434 |
| LWF-73 | عنصر قائمة | المبلغ | public/assets/js/app/pages/admin/lawyer-detail.js:435 |
| LWF-74 | عنصر قائمة | طريقة الصرف | public/assets/js/app/pages/admin/lawyer-detail.js:436 |
| LWF-75 | عنصر قائمة | المرجع | public/assets/js/app/pages/admin/lawyer-detail.js:437 |
| LWF-76 | جدول | عمليات صرف المستحقات | public/assets/js/app/pages/admin/lawyer-detail.js:439 |
| LWF-77 | جدول | عمليات صرف المستحقات | public/assets/js/app/pages/admin/lawyer-detail.js:440 |
| LWF-78 | خيار | (نص متغير) | public/assets/js/app/pages/admin/lawyer-detail.js:455 |
| LWF-79 | عنوان | بيانات المحامي | public/assets/js/app/pages/admin/lawyer-detail.js:480 |
| LWF-80 | قسم/بطاقة | بيانات المحامي | public/assets/js/app/pages/admin/lawyer-detail.js:481 |
| LWF-81 | عنصر قائمة | الاسم بالإنجليزية | public/assets/js/app/pages/admin/lawyer-detail.js:496 |
| LWF-82 | عنصر قائمة | مهارات طلبات الشركات | public/assets/js/app/pages/admin/lawyer-detail.js:497 |
| LWF-83 | عنصر قائمة | b2b_rate | public/assets/js/app/pages/admin/lawyer-detail.js:499 |
| LWF-84 | نافذة | خدمة الشركات | public/assets/js/app/pages/admin/lawyer-detail.js:510 |
| LWF-85 | زر | تعديل | public/assets/js/app/pages/admin/lawyer-detail.js:517 |
| LWF-86 | عنوان | خدمة الشركات | public/assets/js/app/pages/admin/lawyer-detail.js:525 |
| LWF-87 | قسم/بطاقة | خدمة الشركات | public/assets/js/app/pages/admin/lawyer-detail.js:526 |
| LWF-88 | عنوان | اتفاق المحاسبة | public/assets/js/app/pages/admin/lawyer-detail.js:556 |
| LWF-89 | قسم/بطاقة | اتفاق المحاسبة | public/assets/js/app/pages/admin/lawyer-detail.js:556 |
| LWF-90 | عنصر قائمة | لوحة المتابعة | public/assets/js/app/pages/admin/lawyer-detail.js:566 |
| LWF-91 | عنصر قائمة | شبكة المحامين | public/assets/js/app/pages/admin/lawyer-detail.js:566 |
| LWF-92 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/lawyer-detail.js:569 |
| LWF-93 | عنوان | التخصصات: … | public/assets/js/app/pages/admin/lawyer-detail.js:570 |
| LWF-94 | تنبيه | الحساب موقوف | public/assets/js/app/pages/admin/lawyer-detail.js:572 |
| LWF-95 | تنبيه | بانتظار قبول الدعوة | public/assets/js/app/pages/admin/lawyer-detail.js:573 |
| LWF-96 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/lawyer-detail.js:579 |
| LWF-97 | عنصر قائمة | الملفات | public/assets/js/app/pages/admin/lawyer-detail.js:447 |
| LWF-98 | عنصر قائمة | الملفات المستمرة | public/assets/js/app/pages/admin/lawyer-detail.js:448 |
| LWF-99 | عنصر | كشف الحساب | public/assets/js/app/pages/admin/lawyer-detail.js:450 |
| LWF-100 | عنصر | شهر المؤشرات | public/assets/js/app/pages/admin/lawyer-detail.js:234 |

## ACC: المحاسبة (`/app#/accounting`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| ACC-01 | نافذة | إصدار المبالغ الشهرية — | public/assets/js/app/pages/admin/accounting.js:97 |
| ACC-02 | عنصر قائمة | المحامي | public/assets/js/app/pages/admin/accounting.js:112 |
| ACC-03 | عنصر قائمة | المبلغ | public/assets/js/app/pages/admin/accounting.js:113 |
| ACC-04 | جدول | المبالغ الشهرية التي صدرت | public/assets/js/app/pages/admin/accounting.js:115 |
| ACC-05 | جدول | المبالغ الشهرية التي صدرت | public/assets/js/app/pages/admin/accounting.js:116 |
| ACC-06 | عنصر قائمة | تم | public/assets/js/app/pages/admin/accounting.js:121 |
| ACC-07 | نافذة | تم إصدار المبالغ الشهرية | public/assets/js/app/pages/admin/accounting.js:123 |
| ACC-08 | زر | إصدار المبالغ الشهرية لهذا الشهر | public/assets/js/app/pages/admin/accounting.js:126 |
| ACC-09 | زر | شبكة المحامين | public/assets/js/app/pages/admin/accounting.js:176 |
| ACC-10 | حالة فارغة | لا يوجد محامون في الشبكة بعد | public/assets/js/app/pages/admin/accounting.js:176 |
| ACC-11 | تنبيه | مبالغ شهرية لم تُصدر بعد | public/assets/js/app/pages/admin/accounting.js:186 |
| ACC-12 | رابط | (نص متغير) | public/assets/js/app/pages/admin/accounting.js:202 |
| ACC-13 | عنصر قائمة | المحامي والاتفاق | public/assets/js/app/pages/admin/accounting.js:210 |
| ACC-14 | عنصر قائمة | وقائع | public/assets/js/app/pages/admin/accounting.js:212 |
| ACC-15 | عنصر قائمة | الاستهلاك | public/assets/js/app/pages/admin/accounting.js:213 |
| ACC-16 | عنصر قائمة | مستحقات الفترة | public/assets/js/app/pages/admin/accounting.js:222 |
| ACC-17 | عنصر قائمة | رصيد غير مصروف | public/assets/js/app/pages/admin/accounting.js:229 |
| ACC-18 | عنصر قائمة | قيمة المساهمة | public/assets/js/app/pages/admin/accounting.js:231 |
| ACC-19 | زر | عرض قيود | public/assets/js/app/pages/admin/accounting.js:244 |
| ACC-20 | عنصر قائمة | القيود | public/assets/js/app/pages/admin/accounting.js:248 |
| ACC-21 | جدول | ملخص المحاسبة حسب المحامي عن … | public/assets/js/app/pages/admin/accounting.js:251 |
| ACC-22 | جدول | ملخص المحاسبة حسب المحامي عن … | public/assets/js/app/pages/admin/accounting.js:252 |
| ACC-23 | زر | صرف المحدد (… ) | public/assets/js/app/pages/admin/accounting.js:310 |
| ACC-24 | حقل | تحديد كل القيود المستحقة المعروضة | public/assets/js/app/pages/admin/accounting.js:324 |
| ACC-25 | حقل | تحديد القيد … | public/assets/js/app/pages/admin/accounting.js:345 |
| ACC-26 | رابط | (نص متغير) | public/assets/js/app/pages/admin/accounting.js:354 |
| ACC-27 | رابط | (نص متغير) | public/assets/js/app/pages/admin/accounting.js:364 |
| ACC-28 | رابط | (نص متغير) | public/assets/js/app/pages/admin/accounting.js:365 |
| ACC-29 | زر | إلغاء القيد | public/assets/js/app/pages/admin/accounting.js:377 |
| ACC-30 | زر | قيد يدوي / تسوية | public/assets/js/app/pages/admin/accounting.js:395 |
| ACC-31 | تنبيه | لصرف مستحقات، اختر محاميًا من القائمة أولًا ثم حدد القيود المستحقة؛ ت… | public/assets/js/app/pages/admin/accounting.js:397 |
| ACC-32 | تنبيه | تُعرض أحدث 500 قيد فقط، فالإجمالي أعلاه جزئي. اختر محاميًا أو فترة لع… | public/assets/js/app/pages/admin/accounting.js:399 |
| ACC-33 | زر | إلغاء التحديد | public/assets/js/app/pages/admin/accounting.js:414 |
| ACC-34 | جدول | دفتر المستحقات | public/assets/js/app/pages/admin/accounting.js:425 |
| ACC-35 | جدول | دفتر المستحقات | public/assets/js/app/pages/admin/accounting.js:426 |
| ACC-36 | عنصر قائمة | طريقة الصرف | public/assets/js/app/pages/admin/accounting.js:445 |
| ACC-37 | عنصر قائمة | رقم المرجع / الإيصال | public/assets/js/app/pages/admin/accounting.js:446 |
| ACC-38 | عنصر قائمة | تاريخ الصرف | public/assets/js/app/pages/admin/accounting.js:447 |
| ACC-39 | عنصر قائمة | ملاحظة | public/assets/js/app/pages/admin/accounting.js:448 |
| ACC-40 | نافذة | صرف مستحقات المحامي | public/assets/js/app/pages/admin/accounting.js:460 |
| ACC-41 | عنصر قائمة | سبب الإلغاء | public/assets/js/app/pages/admin/accounting.js:474 |
| ACC-42 | نافذة | إلغاء قيد مستحق | public/assets/js/app/pages/admin/accounting.js:476 |
| ACC-43 | عنصر قائمة | إلغاء | public/assets/js/app/pages/admin/accounting.js:534 |
| ACC-44 | عنصر قائمة | تسجيل القيد | public/assets/js/app/pages/admin/accounting.js:561 |
| ACC-45 | نافذة | قيد يدوي / تسوية | public/assets/js/app/pages/admin/accounting.js:564 |
| ACC-46 | حقل | المحامي | public/assets/js/app/pages/admin/accounting.js:582 |
| ACC-47 | حقل | حالة القيد | public/assets/js/app/pages/admin/accounting.js:594 |
| ACC-48 | حقل | فترة القيد | public/assets/js/app/pages/admin/accounting.js:606 |
| ACC-49 | زر | عرض … | public/assets/js/app/pages/admin/accounting.js:629 |
| ACC-50 | حالة فارغة | لم يُغلق أي ملف خلال … | public/assets/js/app/pages/admin/accounting.js:631 |
| ACC-51 | قسم/بطاقة | حسب المجال القانوني | public/assets/js/app/pages/admin/accounting.js:659 |
| ACC-52 | عنوان | حسب المجال القانوني | public/assets/js/app/pages/admin/accounting.js:659 |
| ACC-53 | عنصر قائمة | المجال | public/assets/js/app/pages/admin/accounting.js:665 |
| ACC-54 | عنصر قائمة | الملفات | public/assets/js/app/pages/admin/accounting.js:666 |
| ACC-55 | عنصر قائمة | إجمالي التكلفة | public/assets/js/app/pages/admin/accounting.js:667 |
| ACC-56 | عنصر قائمة | متوسط تكلفة الملف | public/assets/js/app/pages/admin/accounting.js:678 |
| ACC-57 | عنصر قائمة | تحتاج أكثر من تخصص | public/assets/js/app/pages/admin/accounting.js:689 |
| ACC-58 | جدول | تكلفة الملفات المغلقة حسب المجال | public/assets/js/app/pages/admin/accounting.js:692 |
| ACC-59 | جدول | تكلفة الملفات المغلقة حسب المجال | public/assets/js/app/pages/admin/accounting.js:693 |
| ACC-60 | قسم/بطاقة | الملفات المغلقة خلال … | public/assets/js/app/pages/admin/accounting.js:698 |
| ACC-61 | عنوان | الملفات المغلقة خلال … | public/assets/js/app/pages/admin/accounting.js:698 |
| ACC-62 | رابط | (نص متغير) | public/assets/js/app/pages/admin/accounting.js:709 |
| ACC-63 | عنصر قائمة | الملف | public/assets/js/app/pages/admin/accounting.js:710 |
| ACC-64 | عنصر قائمة | المجال | public/assets/js/app/pages/admin/accounting.js:712 |
| ACC-65 | عنصر قائمة | أتعاب مباشرة | public/assets/js/app/pages/admin/accounting.js:713 |
| ACC-66 | عنصر قائمة | مصروفات | public/assets/js/app/pages/admin/accounting.js:714 |
| ACC-67 | عنصر قائمة | محمّل تقديريًا | public/assets/js/app/pages/admin/accounting.js:715 |
| ACC-68 | عنصر قائمة | الإجمالي | public/assets/js/app/pages/admin/accounting.js:716 |
| ACC-69 | عنصر قائمة | قيمة تطوعية | public/assets/js/app/pages/admin/accounting.js:717 |
| ACC-70 | عنصر قائمة | الفريق | public/assets/js/app/pages/admin/accounting.js:722 |
| ACC-71 | جدول | تكلفة كل ملف مغلق | public/assets/js/app/pages/admin/accounting.js:725 |
| ACC-72 | جدول | تكلفة كل ملف مغلق | public/assets/js/app/pages/admin/accounting.js:726 |
| ACC-73 | عنصر قائمة | المحامون والاتفاقات | public/assets/js/app/pages/admin/accounting.js:734 |
| ACC-74 | عنصر قائمة | دفتر المستحقات | public/assets/js/app/pages/admin/accounting.js:735 |
| ACC-75 | عنصر قائمة | تكلفة الملفات | public/assets/js/app/pages/admin/accounting.js:736 |
| ACC-76 | خيار | المحامون والاتفاقات | public/assets/js/app/pages/admin/accounting.js:744 |
| ACC-77 | عنصر قائمة | لوحة المتابعة | public/assets/js/app/pages/admin/accounting.js:762 |
| ACC-78 | عنوان | المحاسبة | public/assets/js/app/pages/admin/accounting.js:764 |
| ACC-79 | عنوان | المحاسبة | public/assets/js/app/pages/admin/accounting.js:765 |
| ACC-80 | بطاقة رقم | مستحقات | public/assets/js/app/pages/admin/accounting.js:775 |
| ACC-81 | بطاقة رقم | رصيد غير مصروف | public/assets/js/app/pages/admin/accounting.js:794 |
| ACC-82 | بطاقة رقم | المصروف خلال الفترة | public/assets/js/app/pages/admin/accounting.js:796 |
| ACC-83 | بطاقة رقم | وقائع الاستحقاق | public/assets/js/app/pages/admin/accounting.js:797 |
| ACC-84 | بطاقة رقم | وقائع تطوعية ومسؤولية مجتمعية | public/assets/js/app/pages/admin/accounting.js:798 |
| ACC-85 | بطاقة رقم | قيمة المساهمات | public/assets/js/app/pages/admin/accounting.js:799 |
| ACC-86 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/accounting.js:801 |
| ACC-87 | عنصر قائمة | المحامي | public/assets/js/app/pages/admin/accounting.js:497 |
| ACC-88 | عنصر قائمة | المبلغ | public/assets/js/app/pages/admin/accounting.js:499 |
| ACC-89 | عنصر قائمة | البيان | public/assets/js/app/pages/admin/accounting.js:500 |
| ACC-90 | عنصر قائمة | الملف المرتبط (اختياري) | public/assets/js/app/pages/admin/accounting.js:501 |
| ACC-91 | نموذج | المحامي | public/assets/js/app/pages/admin/accounting.js:503 |
| ACC-92 | عنصر | الفترة المحاسبية | public/assets/js/app/pages/admin/accounting.js:750 |

## AUT: الأتمتة والرسائل وصندوق الصادر (`/app#/automations`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| AUT-01 | رابط | (نص متغير) | public/assets/js/app/pages/admin/automations.js:165 |
| AUT-02 | زر | مفعّلة | public/assets/js/app/pages/admin/automations.js:203 |
| AUT-03 | رابط | إعدادات واتساب والتكاملات | public/assets/js/app/pages/admin/automations.js:247 |
| AUT-04 | تنبيه | الرسائل الآلية والفردية تُرسل فعليًا للمستفيدين عبر WhatsApp Business… | public/assets/js/app/pages/admin/automations.js:251 |
| AUT-05 | نافذة | إيقاف القاعدة | public/assets/js/app/pages/admin/automations.js:280 |
| AUT-06 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/automations.js:302 |
| AUT-07 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/automations.js:303 |
| AUT-08 | قسم/بطاقة | تعديل الإعدادات | public/assets/js/app/pages/admin/automations.js:341 |
| AUT-09 | زر | تعديل الإعدادات | public/assets/js/app/pages/admin/automations.js:341 |
| AUT-10 | حالة فارغة | لا توجد قواعد أتمتة معرّفة | public/assets/js/app/pages/admin/automations.js:348 |
| AUT-11 | زر | إدراج … | public/assets/js/app/pages/admin/automations.js:413 |
| AUT-12 | عنصر قائمة | إلغاء | public/assets/js/app/pages/admin/automations.js:433 |
| AUT-13 | عنصر قائمة | حفظ الإعدادات | public/assets/js/app/pages/admin/automations.js:460 |
| AUT-14 | نافذة | إعدادات « | public/assets/js/app/pages/admin/automations.js:463 |
| AUT-15 | زر | عرض النص كاملًا | public/assets/js/app/pages/admin/automations.js:508 |
| AUT-16 | عنصر قائمة | الوقت | public/assets/js/app/pages/admin/automations.js:541 |
| AUT-17 | رابط | مستفيد/ة | public/assets/js/app/pages/admin/automations.js:548 |
| AUT-18 | عنصر قائمة | المستفيد/ة | public/assets/js/app/pages/admin/automations.js:550 |
| AUT-19 | رابط | (نص متغير) | public/assets/js/app/pages/admin/automations.js:559 |
| AUT-20 | رابط | (نص متغير) | public/assets/js/app/pages/admin/automations.js:560 |
| AUT-21 | عنصر قائمة | الملف | public/assets/js/app/pages/admin/automations.js:563 |
| AUT-22 | عنصر قائمة | القناة والحالة | public/assets/js/app/pages/admin/automations.js:569 |
| AUT-23 | عنصر قائمة | المصدر | public/assets/js/app/pages/admin/automations.js:578 |
| AUT-24 | عنصر قائمة | نص الرسالة | public/assets/js/app/pages/admin/automations.js:580 |
| AUT-25 | زر | إعادة الإرسال | public/assets/js/app/pages/admin/automations.js:596 |
| AUT-26 | عنصر قائمة | إعادة الإرسال | public/assets/js/app/pages/admin/automations.js:602 |
| AUT-27 | جدول | الرسائل الصادرة للمستفيدين | public/assets/js/app/pages/admin/automations.js:605 |
| AUT-28 | حقل | حالة الرسالة | public/assets/js/app/pages/admin/automations.js:621 |
| AUT-29 | زر | تحديث | public/assets/js/app/pages/admin/automations.js:627 |
| AUT-30 | خيار | قواعد الأتمتة | public/assets/js/app/pages/admin/automations.js:644 |
| AUT-31 | نافذة | تشغيل قواعد الأتمتة الآن | public/assets/js/app/pages/admin/automations.js:675 |
| AUT-32 | عنصر قائمة | تم | public/assets/js/app/pages/admin/automations.js:712 |
| AUT-33 | نافذة | نتيجة تشغيل القواعد | public/assets/js/app/pages/admin/automations.js:714 |
| AUT-34 | زر | تشغيل القواعد الآن | public/assets/js/app/pages/admin/automations.js:717 |
| AUT-35 | عنصر قائمة | لوحة المتابعة | public/assets/js/app/pages/admin/automations.js:724 |
| AUT-36 | عنوان | الأتمتة والرسائل | public/assets/js/app/pages/admin/automations.js:726 |
| AUT-37 | عنوان | الأتمتة والرسائل | public/assets/js/app/pages/admin/automations.js:727 |
| AUT-38 | تنبيه | تعديل القواعد وتفعيلها أو إيقافها متاح لدور «إدارة النظام» فقط. | public/assets/js/app/pages/admin/automations.js:730 |
| AUT-39 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/automations.js:731 |
| AUT-40 | نموذج | (نص متغير) | public/assets/js/app/pages/admin/automations.js:374 |
| AUT-41 | عنصر قائمة | قواعد الأتمتة | public/assets/js/app/pages/admin/automations.js:634 |
| AUT-42 | عنصر قائمة | صندوق الصادر | public/assets/js/app/pages/admin/automations.js:635 |
| AUT-43 | عنصر قائمة | صادر البريد | public/assets/js/app/pages/admin/automations.js:636 |
| AUT-44 | خيار | عدد الأيام قبل الموعد | public/assets/js/app/pages/admin/automations.js:91 |
| AUT-45 | خيار | بعد كم يوم من إرسال الطلب للمستفيد/ة | public/assets/js/app/pages/admin/automations.js:92 |
| AUT-46 | خيار | الفاصل بين التذكيرات | public/assets/js/app/pages/admin/automations.js:93 |
| AUT-47 | خيار | الحد الأقصى للتذكيرات | public/assets/js/app/pages/admin/automations.js:94 |
| AUT-48 | خيار | بعد كم ساعة من إرسال الرد | public/assets/js/app/pages/admin/automations.js:95 |
| AUT-49 | خيار | مدة قبول التقييم | public/assets/js/app/pages/admin/automations.js:96 |
| AUT-50 | عنصر | template | public/assets/js/app/pages/admin/automations.js:372 |
| AUT-51 | عنصر | template_paid | public/assets/js/app/pages/admin/automations.js:373 |

## QRP: الردود الجاهزة وقوالب واتساب (`/app#/quick-replies`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| QRP-01 | زر | رد جاهز جديد | public/assets/js/app/pages/admin/quick-replies.js:97 |
| QRP-02 | حالة فارغة | لا توجد ردود جاهزة بعد | public/assets/js/app/pages/admin/quick-replies.js:100 |
| QRP-03 | حالة فارغة | لا توجد ردود مطابقة للبحث أو التصنيف المختار | public/assets/js/app/pages/admin/quick-replies.js:106 |
| QRP-04 | قسم/بطاقة | اكتب الاختصار في محرر الرسالة ثم مسافة لإدراج الرد | public/assets/js/app/pages/admin/quick-replies.js:117 |
| QRP-05 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/quick-replies.js:117 |
| QRP-06 | قسم/بطاقة | استُخدم … | public/assets/js/app/pages/admin/quick-replies.js:127 |
| QRP-07 | زر | نسخ | public/assets/js/app/pages/admin/quick-replies.js:135 |
| QRP-08 | زر | تعديل | public/assets/js/app/pages/admin/quick-replies.js:136 |
| QRP-09 | نافذة | حذف الرد الجاهز | public/assets/js/app/pages/admin/quick-replies.js:143 |
| QRP-10 | زر | حذف | public/assets/js/app/pages/admin/quick-replies.js:153 |
| QRP-11 | زر | إدراج … | public/assets/js/app/pages/admin/quick-replies.js:196 |
| QRP-12 | عنصر قائمة | إلغاء | public/assets/js/app/pages/admin/quick-replies.js:209 |
| QRP-13 | عنصر قائمة | حفظ التعديلات | public/assets/js/app/pages/admin/quick-replies.js:234 |
| QRP-14 | نافذة | تعديل «… » | public/assets/js/app/pages/admin/quick-replies.js:237 |
| QRP-15 | حقل | بحث في الردود الجاهزة | public/assets/js/app/pages/admin/quick-replies.js:252 |
| QRP-16 | حقل | التصنيف | public/assets/js/app/pages/admin/quick-replies.js:264 |
| QRP-17 | زر | رد جاهز جديد | public/assets/js/app/pages/admin/quick-replies.js:267 |
| QRP-18 | تنبيه | واتساب متصل | public/assets/js/app/pages/admin/quick-replies.js:296 |
| QRP-19 | تنبيه | تنقص بيانات المزامنة | public/assets/js/app/pages/admin/quick-replies.js:303 |
| QRP-20 | تنبيه | واتساب في وضع المحاكاة | public/assets/js/app/pages/admin/quick-replies.js:309 |
| QRP-21 | زر | تعديل الربط | public/assets/js/app/pages/admin/quick-replies.js:352 |
| QRP-22 | نافذة | إلغاء ربط القالب | public/assets/js/app/pages/admin/quick-replies.js:359 |
| QRP-23 | زر | إلغاء الربط | public/assets/js/app/pages/admin/quick-replies.js:369 |
| QRP-24 | حقل | القالب | public/assets/js/app/pages/admin/quick-replies.js:387 |
| QRP-25 | حقل | قيمة المتغير … | public/assets/js/app/pages/admin/quick-replies.js:399 |
| QRP-26 | عنصر قائمة | إلغاء | public/assets/js/app/pages/admin/quick-replies.js:433 |
| QRP-27 | عنصر قائمة | حفظ الربط | public/assets/js/app/pages/admin/quick-replies.js:444 |
| QRP-28 | نافذة | ربط قالب: | public/assets/js/app/pages/admin/quick-replies.js:447 |
| QRP-29 | عنصر قائمة | القالب | public/assets/js/app/pages/admin/quick-replies.js:461 |
| QRP-30 | عنصر قائمة | الفئة | public/assets/js/app/pages/admin/quick-replies.js:463 |
| QRP-31 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/quick-replies.js:468 |
| QRP-32 | عنصر قائمة | المتغيرات | public/assets/js/app/pages/admin/quick-replies.js:470 |
| QRP-33 | عنصر قائمة | النص | public/assets/js/app/pages/admin/quick-replies.js:484 |
| QRP-34 | جدول | قوالب واتساب المتزامنة | public/assets/js/app/pages/admin/quick-replies.js:489 |
| QRP-35 | جدول | قوالب واتساب المتزامنة | public/assets/js/app/pages/admin/quick-replies.js:490 |
| QRP-36 | زر | تفعيل الدخول إلى صفحة المتابعة برمز واتساب | public/assets/js/app/pages/admin/quick-replies.js:523 |
| QRP-37 | نافذة | إيقاف الدخول برمز واتساب | public/assets/js/app/pages/admin/quick-replies.js:536 |
| QRP-38 | تنبيه | (نص متغير) | public/assets/js/app/pages/admin/quick-replies.js:555 |
| QRP-39 | عنوان | الدخول إلى صفحة المتابعة برمز واتساب | public/assets/js/app/pages/admin/quick-replies.js:556 |
| QRP-40 | قسم/بطاقة | الدخول إلى صفحة المتابعة برمز واتساب | public/assets/js/app/pages/admin/quick-replies.js:557 |
| QRP-41 | زر | مزامنة القوالب | public/assets/js/app/pages/admin/quick-replies.js:579 |
| QRP-42 | زر | اختبار الاتصال | public/assets/js/app/pages/admin/quick-replies.js:588 |
| QRP-43 | زر | إعدادات التكاملات | public/assets/js/app/pages/admin/quick-replies.js:590 |
| QRP-44 | عنوان | ربط القوالب بأغراض الإرسال | public/assets/js/app/pages/admin/quick-replies.js:603 |
| QRP-45 | قسم/بطاقة | ربط القوالب بأغراض الإرسال | public/assets/js/app/pages/admin/quick-replies.js:604 |
| QRP-46 | عنوان | القوالب المتزامنة | public/assets/js/app/pages/admin/quick-replies.js:612 |
| QRP-47 | قسم/بطاقة | القوالب المتزامنة | public/assets/js/app/pages/admin/quick-replies.js:613 |
| QRP-48 | حقل | … من 5… — … | public/assets/js/app/pages/admin/quick-replies.js:626 |
| QRP-49 | زر | حفظ | public/assets/js/app/pages/admin/quick-replies.js:641 |
| QRP-50 | حقل | التقييم المنخفض الذي يُنبَّه عنده مدير الحالة فورًا | public/assets/js/app/pages/admin/quick-replies.js:652 |
| QRP-51 | رابط | صفحة الأتمتة | public/assets/js/app/pages/admin/quick-replies.js:656 |
| QRP-52 | عنوان | إعدادات الاستبيان | public/assets/js/app/pages/admin/quick-replies.js:658 |
| QRP-53 | قسم/بطاقة | إعدادات الاستبيان | public/assets/js/app/pages/admin/quick-replies.js:659 |
| QRP-54 | بطاقة رقم | متوسط رضا المستفيدين | public/assets/js/app/pages/admin/quick-replies.js:668 |
| QRP-55 | بطاقة رقم | نسبة الاستجابة | public/assets/js/app/pages/admin/quick-replies.js:669 |
| QRP-56 | بطاقة رقم | تقييمات منخفضة | public/assets/js/app/pages/admin/quick-replies.js:670 |
| QRP-57 | بطاقة رقم | بانتظار التقييم | public/assets/js/app/pages/admin/quick-replies.js:671 |
| QRP-58 | زر | إعدادات الاستبيان في الأتمتة | public/assets/js/app/pages/admin/quick-replies.js:678 |
| QRP-59 | حالة فارغة | لم تُرسل استبيانات بعد | public/assets/js/app/pages/admin/quick-replies.js:678 |
| QRP-60 | قسم/بطاقة | يُرسل استبيان الرضا تلقائيًا بعد إرسال الرد النهائي للمستفيد/ة بيوم (… | public/assets/js/app/pages/admin/quick-replies.js:679 |
| QRP-61 | عنوان | توزيع التقييمات | public/assets/js/app/pages/admin/quick-replies.js:700 |
| QRP-62 | قسم/بطاقة | توزيع التقييمات | public/assets/js/app/pages/admin/quick-replies.js:701 |
| QRP-63 | عنصر قائمة | الشهر | public/assets/js/app/pages/admin/quick-replies.js:712 |
| QRP-64 | عنصر قائمة | أُرسل | public/assets/js/app/pages/admin/quick-replies.js:713 |
| QRP-65 | عنصر قائمة | التقييمات | public/assets/js/app/pages/admin/quick-replies.js:714 |
| QRP-66 | عنصر قائمة | المتوسط | public/assets/js/app/pages/admin/quick-replies.js:715 |
| QRP-67 | جدول | رضا المستفيدين بالشهر | public/assets/js/app/pages/admin/quick-replies.js:718 |
| QRP-68 | جدول | رضا المستفيدين بالشهر | public/assets/js/app/pages/admin/quick-replies.js:719 |
| QRP-69 | عنوان | بالشهر | public/assets/js/app/pages/admin/quick-replies.js:721 |
| QRP-70 | قسم/بطاقة | بالشهر | public/assets/js/app/pages/admin/quick-replies.js:722 |
| QRP-71 | عنصر قائمة | المجال | public/assets/js/app/pages/admin/quick-replies.js:732 |
| QRP-72 | عنصر قائمة | التقييمات | public/assets/js/app/pages/admin/quick-replies.js:733 |
| QRP-73 | عنصر قائمة | المتوسط | public/assets/js/app/pages/admin/quick-replies.js:734 |
| QRP-74 | عنصر قائمة | منخفض | public/assets/js/app/pages/admin/quick-replies.js:735 |
| QRP-75 | جدول | رضا المستفيدين بالمجال القانوني | public/assets/js/app/pages/admin/quick-replies.js:738 |
| QRP-76 | جدول | رضا المستفيدين بالمجال القانوني | public/assets/js/app/pages/admin/quick-replies.js:739 |
| QRP-77 | عنوان | بالمجال القانوني | public/assets/js/app/pages/admin/quick-replies.js:741 |
| QRP-78 | قسم/بطاقة | بالمجال القانوني | public/assets/js/app/pages/admin/quick-replies.js:742 |
| QRP-79 | رابط | (نص متغير) | public/assets/js/app/pages/admin/quick-replies.js:752 |
| QRP-80 | عنصر قائمة | المحامي | public/assets/js/app/pages/admin/quick-replies.js:752 |
| QRP-81 | عنصر قائمة | التقييمات | public/assets/js/app/pages/admin/quick-replies.js:753 |
| QRP-82 | عنصر قائمة | المتوسط | public/assets/js/app/pages/admin/quick-replies.js:754 |
| QRP-83 | عنصر قائمة | منخفض | public/assets/js/app/pages/admin/quick-replies.js:755 |
| QRP-84 | جدول | رضا المستفيدين بالمحامي الأساسي | public/assets/js/app/pages/admin/quick-replies.js:759 |
| QRP-85 | جدول | رضا المستفيدين بالمحامي الأساسي | public/assets/js/app/pages/admin/quick-replies.js:760 |
| QRP-86 | عنوان | بالمحامي الأساسي | public/assets/js/app/pages/admin/quick-replies.js:762 |
| QRP-87 | قسم/بطاقة | بالمحامي الأساسي | public/assets/js/app/pages/admin/quick-replies.js:763 |
| QRP-88 | رابط | فتح الملف … | public/assets/js/app/pages/admin/quick-replies.js:779 |
| QRP-89 | حالة فارغة | لا توجد تقييمات بعد | public/assets/js/app/pages/admin/quick-replies.js:789 |
| QRP-90 | عنوان | آخر التقييمات والتعليقات | public/assets/js/app/pages/admin/quick-replies.js:790 |
| QRP-91 | قسم/بطاقة | آخر التقييمات والتعليقات | public/assets/js/app/pages/admin/quick-replies.js:791 |
| QRP-92 | رابط | إعدادات توقيت الاستبيان ونصه | public/assets/js/app/pages/admin/quick-replies.js:795 |
| QRP-93 | عنصر قائمة | الردود الجاهزة | public/assets/js/app/pages/admin/quick-replies.js:806 |
| QRP-94 | عنصر قائمة | قوالب واتساب | public/assets/js/app/pages/admin/quick-replies.js:807 |
| QRP-95 | عنصر قائمة | رضا المستفيدين | public/assets/js/app/pages/admin/quick-replies.js:808 |
| QRP-96 | خيار | الردود الجاهزة | public/assets/js/app/pages/admin/quick-replies.js:816 |
| QRP-97 | عنوان | الردود الجاهزة وقوالب واتساب | public/assets/js/app/pages/admin/quick-replies.js:824 |
| QRP-98 | عنوان | الردود الجاهزة وقوالب واتساب | public/assets/js/app/pages/admin/quick-replies.js:825 |
| QRP-99 | زر | إدراج رد جاهز في الرسالة | public/assets/js/app/components/quick-replies.js:98 |
| QRP-100 | حقل | ابحث بالعنوان أو النص أو الاختصار مثل /وثائق | public/assets/js/app/components/quick-replies.js:114 |
| QRP-101 | زر | إضافة ردود من صفحة الردود الجاهزة | public/assets/js/app/components/quick-replies.js:145 |
| QRP-102 | حالة فارغة | لا توجد ردود جاهزة بعد | public/assets/js/app/components/quick-replies.js:148 |
| QRP-103 | حالة فارغة | لا توجد ردود مطابقة للبحث | public/assets/js/app/components/quick-replies.js:154 |
| QRP-104 | زر | (نص متغير) | public/assets/js/app/components/quick-replies.js:176 |
| QRP-105 | زر | (نص متغير) | public/assets/js/app/components/quick-replies.js:209 |
| QRP-106 | نافذة | إدراج رد جاهز | public/assets/js/app/components/quick-replies.js:245 |
| QRP-107 | عنصر قائمة | عنوان الرد | public/assets/js/app/pages/admin/quick-replies.js:163 |
| QRP-108 | عنصر قائمة | الاختصار (اختياري) | public/assets/js/app/pages/admin/quick-replies.js:164 |
| QRP-109 | عنصر قائمة | التصنيف | public/assets/js/app/pages/admin/quick-replies.js:165 |
| QRP-110 | عنصر قائمة | نص الرد | public/assets/js/app/pages/admin/quick-replies.js:166 |
| QRP-111 | نموذج | عنوان الرد | public/assets/js/app/pages/admin/quick-replies.js:168 |

## KNL: المعرفة والذكاء الاصطناعي (`/app#/knowledge`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| KNL-01 | رابط | (نص متغير) | public/assets/js/app/pages/admin/knowledge.js:87 |
| KNL-02 | زر | عرض كل التصحيحات (… ) | public/assets/js/app/pages/admin/knowledge.js:115 |
| KNL-03 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/knowledge.js:130 |
| KNL-04 | رابط | (نص متغير) | public/assets/js/app/pages/admin/knowledge.js:138 |
| KNL-05 | بطاقة رقم | إجمالي السجلات | public/assets/js/app/pages/admin/knowledge.js:200 |
| KNL-06 | بطاقة رقم | بانتظار المراجعة | public/assets/js/app/pages/admin/knowledge.js:208 |
| KNL-07 | بطاقة رقم | معتمدة | public/assets/js/app/pages/admin/knowledge.js:210 |
| KNL-08 | بطاقة رقم | معتمدة للتدريب | public/assets/js/app/pages/admin/knowledge.js:211 |
| KNL-09 | بطاقة رقم | مستبعدة | public/assets/js/app/pages/admin/knowledge.js:212 |
| KNL-10 | زر | مسح التصفية | public/assets/js/app/pages/admin/knowledge.js:232 |
| KNL-11 | حالة فارغة | لا توجد سجلات مطابقة للتصفية الحالية | public/assets/js/app/pages/admin/knowledge.js:233 |
| KNL-12 | رابط | (نص متغير) | public/assets/js/app/pages/admin/knowledge.js:251 |
| KNL-13 | عنصر قائمة | العنوان | public/assets/js/app/pages/admin/knowledge.js:252 |
| KNL-14 | عنصر قائمة | الملف | public/assets/js/app/pages/admin/knowledge.js:254 |
| KNL-15 | عنصر قائمة | الحالة والاستخدام | public/assets/js/app/pages/admin/knowledge.js:259 |
| KNL-16 | عنصر قائمة | طلبات المساعدة / التصحيحات | public/assets/js/app/pages/admin/knowledge.js:270 |
| KNL-17 | عنصر قائمة | النتيجة | public/assets/js/app/pages/admin/knowledge.js:272 |
| KNL-18 | عنصر قائمة | آخر تحديث | public/assets/js/app/pages/admin/knowledge.js:273 |
| KNL-19 | جدول | سجلات المعرفة المؤسسية | public/assets/js/app/pages/admin/knowledge.js:275 |
| KNL-20 | جدول | سجلات المعرفة المؤسسية | public/assets/js/app/pages/admin/knowledge.js:276 |
| KNL-21 | حقل | صف المشكلة بكلمات المستفيد/ة، مثل: أخي يرفض تقسيم شقة والدنا المتوفى… | public/assets/js/app/pages/admin/knowledge.js:300 |
| KNL-22 | حالة فارغة | لم نجد حالات معتمدة مشابهة بما يكفي. جرّب صياغة أخرى أو كلمات أكثر تح… | public/assets/js/app/pages/admin/knowledge.js:314 |
| KNL-23 | رابط | (نص متغير) | public/assets/js/app/pages/admin/knowledge.js:328 |
| KNL-24 | حقل | بحث نصي في سجلات المعرفة | public/assets/js/app/pages/admin/knowledge.js:358 |
| KNL-25 | حقل | حالة المراجعة | public/assets/js/app/pages/admin/knowledge.js:369 |
| KNL-26 | حقل | المجال | public/assets/js/app/pages/admin/knowledge.js:380 |
| KNL-27 | حقل | نطاق الاستخدام | public/assets/js/app/pages/admin/knowledge.js:391 |
| KNL-28 | قسم/بطاقة | البحث بالمعنى في المعرفة المعتمدة | public/assets/js/app/pages/admin/knowledge.js:401 |
| KNL-29 | عنوان | البحث بالمعنى في المعرفة المعتمدة | public/assets/js/app/pages/admin/knowledge.js:401 |
| KNL-30 | زر | ابحث | public/assets/js/app/pages/admin/knowledge.js:403 |
| KNL-31 | قسم/بطاقة | سجلات المعرفة | public/assets/js/app/pages/admin/knowledge.js:408 |
| KNL-32 | عنوان | سجلات المعرفة | public/assets/js/app/pages/admin/knowledge.js:408 |
| KNL-33 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/knowledge.js:410 |
| KNL-34 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/knowledge.js:421 |
| KNL-35 | تنبيه | كيف نقيس أداء الذكاء الاصطناعي؟ | public/assets/js/app/pages/admin/knowledge.js:466 |
| KNL-36 | قسم/بطاقة | الدقة حسب نوع الاقتراح | public/assets/js/app/pages/admin/knowledge.js:472 |
| KNL-37 | عنوان | الدقة حسب نوع الاقتراح | public/assets/js/app/pages/admin/knowledge.js:472 |
| KNL-38 | حالة فارغة | لا توجد مراجعات مسجلة بعد لقياس الدقة | public/assets/js/app/pages/admin/knowledge.js:473 |
| KNL-39 | قسم/بطاقة | تطور الدقة شهريًا | public/assets/js/app/pages/admin/knowledge.js:478 |
| KNL-40 | عنوان | تطور الدقة شهريًا | public/assets/js/app/pages/admin/knowledge.js:478 |
| KNL-41 | عنصر قائمة | الشهر | public/assets/js/app/pages/admin/knowledge.js:485 |
| KNL-42 | جدول | الدقة الشهرية حسب نوع الاقتراح | public/assets/js/app/pages/admin/knowledge.js:502 |
| KNL-43 | جدول | الدقة الشهرية حسب نوع الاقتراح | public/assets/js/app/pages/admin/knowledge.js:503 |
| KNL-44 | قسم/بطاقة | الاستخدام حسب المزود | public/assets/js/app/pages/admin/knowledge.js:511 |
| KNL-45 | عنوان | الاستخدام حسب المزود | public/assets/js/app/pages/admin/knowledge.js:511 |
| KNL-46 | عنصر قائمة | المزود | public/assets/js/app/pages/admin/knowledge.js:517 |
| KNL-47 | عنصر قائمة | نوع الاقتراح | public/assets/js/app/pages/admin/knowledge.js:518 |
| KNL-48 | عنصر قائمة | العدد | public/assets/js/app/pages/admin/knowledge.js:519 |
| KNL-49 | جدول | عدد الاقتراحات حسب المزود والنوع | public/assets/js/app/pages/admin/knowledge.js:521 |
| KNL-50 | جدول | عدد الاقتراحات حسب المزود والنوع | public/assets/js/app/pages/admin/knowledge.js:522 |
| KNL-51 | قسم/بطاقة | ملخص المراجعات | public/assets/js/app/pages/admin/knowledge.js:527 |
| KNL-52 | عنوان | ملخص المراجعات | public/assets/js/app/pages/admin/knowledge.js:527 |
| KNL-53 | عنصر قائمة | القرار | public/assets/js/app/pages/admin/knowledge.js:532 |
| KNL-54 | عنصر قائمة | العدد | public/assets/js/app/pages/admin/knowledge.js:533 |
| KNL-55 | جدول | ملخص قرارات المراجعة | public/assets/js/app/pages/admin/knowledge.js:535 |
| KNL-56 | جدول | ملخص قرارات المراجعة | public/assets/js/app/pages/admin/knowledge.js:536 |
| KNL-57 | قسم/بطاقة | أحدث التصحيحات | public/assets/js/app/pages/admin/knowledge.js:542 |
| KNL-58 | عنوان | أحدث التصحيحات | public/assets/js/app/pages/admin/knowledge.js:542 |
| KNL-59 | حالة فارغة | لا توجد تصحيحات بعد | public/assets/js/app/pages/admin/knowledge.js:544 |
| KNL-60 | عنصر قائمة | قاعدة المعرفة | public/assets/js/app/pages/admin/knowledge.js:552 |
| KNL-61 | عنصر قائمة | أداء الذكاء الاصطناعي | public/assets/js/app/pages/admin/knowledge.js:553 |
| KNL-62 | خيار | قاعدة المعرفة | public/assets/js/app/pages/admin/knowledge.js:561 |
| KNL-63 | زر | يصدّر الحالات المعتمدة للتدريب فقط، بعد إخفاء البيانات الشخصية | public/assets/js/app/pages/admin/knowledge.js:574 |
| KNL-64 | عنصر قائمة | لوحة المتابعة | public/assets/js/app/pages/admin/knowledge.js:582 |
| KNL-65 | عنوان | المعرفة المؤسسية والذكاء الاصطناعي | public/assets/js/app/pages/admin/knowledge.js:584 |
| KNL-66 | عنوان | المعرفة المؤسسية والذكاء الاصطناعي | public/assets/js/app/pages/admin/knowledge.js:585 |
| KNL-67 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/knowledge.js:588 |
| KNL-68 | رابط | صفحة التكاملات | public/assets/js/app/components/ai-usage.js:36 |
| KNL-69 | تنبيه | تجاوز إنفاق الذكاء الاصطناعي السقف الشهري | public/assets/js/app/components/ai-usage.js:41 |
| KNL-70 | تنبيه | اقترب الإنفاق من السقف الشهري | public/assets/js/app/components/ai-usage.js:48 |
| KNL-71 | تنبيه | نجح الاتصال بالنموذج | public/assets/js/app/components/ai-usage.js:65 |
| KNL-72 | تنبيه | فشل اختبار الاتصال | public/assets/js/app/components/ai-usage.js:66 |
| KNL-73 | زر | يرسل طلبًا صغيرًا حقيقيًا للتحقق من المفتاح والنموذج | public/assets/js/app/components/ai-usage.js:70 |
| KNL-74 | رابط | صفحة التكاملات | public/assets/js/app/components/ai-usage.js:79 |
| KNL-75 | عنوان | مزود التحليل الحالي | public/assets/js/app/components/ai-usage.js:98 |
| KNL-76 | قسم/بطاقة | مزود التحليل الحالي | public/assets/js/app/components/ai-usage.js:99 |
| KNL-77 | قسم/بطاقة | الاستهلاك والتكلفة | public/assets/js/app/components/ai-usage.js:106 |
| KNL-78 | عنوان | الاستهلاك والتكلفة | public/assets/js/app/components/ai-usage.js:106 |
| KNL-79 | رابط | حدده من صفحة التكاملات | public/assets/js/app/components/ai-usage.js:123 |
| KNL-80 | قسم/بطاقة | الاستهلاك والتكلفة — … | public/assets/js/app/components/ai-usage.js:127 |
| KNL-81 | عنوان | الاستهلاك والتكلفة — … | public/assets/js/app/components/ai-usage.js:127 |
| KNL-82 | بطاقة رقم | التكلفة التقديرية هذا الشهر | public/assets/js/app/components/ai-usage.js:131 |
| KNL-83 | بطاقة رقم | استدعاءات Claude | public/assets/js/app/components/ai-usage.js:132 |
| KNL-84 | بطاقة رقم | خدمها المحلل المحلي | public/assets/js/app/components/ai-usage.js:133 |
| KNL-85 | بطاقة رقم | الأخطاء | public/assets/js/app/components/ai-usage.js:134 |
| KNL-86 | عنوان | الاستدعاءات حسب الوظيفة | public/assets/js/app/components/ai-usage.js:141 |
| KNL-87 | عنصر قائمة | الوظيفة | public/assets/js/app/components/ai-usage.js:148 |
| KNL-88 | عنصر قائمة | Claude | public/assets/js/app/components/ai-usage.js:149 |
| KNL-89 | عنصر قائمة | محليًا | public/assets/js/app/components/ai-usage.js:150 |
| KNL-90 | عنصر قائمة | أخطاء | public/assets/js/app/components/ai-usage.js:151 |
| KNL-91 | عنصر قائمة | الرموز (إدخال / إخراج) | public/assets/js/app/components/ai-usage.js:152 |
| KNL-92 | عنصر قائمة | التكلفة | public/assets/js/app/components/ai-usage.js:153 |
| KNL-93 | جدول | استدعاءات الذكاء الاصطناعي حسب الوظيفة هذا الشهر | public/assets/js/app/components/ai-usage.js:155 |
| KNL-94 | جدول | استدعاءات الذكاء الاصطناعي حسب الوظيفة هذا الشهر | public/assets/js/app/components/ai-usage.js:156 |
| KNL-95 | عنوان | آخر الأشهر | public/assets/js/app/components/ai-usage.js:162 |
| KNL-96 | عنصر قائمة | الشهر | public/assets/js/app/components/ai-usage.js:168 |
| KNL-97 | عنصر قائمة | Claude | public/assets/js/app/components/ai-usage.js:169 |
| KNL-98 | عنصر قائمة | أخطاء | public/assets/js/app/components/ai-usage.js:170 |
| KNL-99 | عنصر قائمة | التكلفة | public/assets/js/app/components/ai-usage.js:171 |
| KNL-100 | جدول | التكلفة والاستدعاءات شهريًا | public/assets/js/app/components/ai-usage.js:173 |
| KNL-101 | جدول | التكلفة والاستدعاءات شهريًا | public/assets/js/app/components/ai-usage.js:174 |
| KNL-102 | عنوان | أحدث الأخطاء (… ) | public/assets/js/app/components/ai-usage.js:182 |
| KNL-103 | عنصر قائمة | إغلاق | public/assets/js/app/components/ai-usage.js:214 |
| KNL-104 | نافذة | تحليل المستند: | public/assets/js/app/components/ai-usage.js:215 |
| KNL-105 | قسم/بطاقة | أحدث تحليلات المستندات | public/assets/js/app/components/ai-usage.js:219 |
| KNL-106 | عنوان | أحدث تحليلات المستندات | public/assets/js/app/components/ai-usage.js:219 |
| KNL-107 | عنصر قائمة | المستند | public/assets/js/app/components/ai-usage.js:228 |
| KNL-108 | رابط | (نص متغير) | public/assets/js/app/components/ai-usage.js:229 |
| KNL-109 | عنصر قائمة | الملف | public/assets/js/app/components/ai-usage.js:229 |
| KNL-110 | عنصر قائمة | نوع التحليل | public/assets/js/app/components/ai-usage.js:230 |
| KNL-111 | عنصر قائمة | التاريخ | public/assets/js/app/components/ai-usage.js:231 |
| KNL-112 | زر | عرض | public/assets/js/app/components/ai-usage.js:232 |
| KNL-113 | عنصر قائمة | عرض | public/assets/js/app/components/ai-usage.js:232 |
| KNL-114 | جدول | أحدث تحليلات المستندات | public/assets/js/app/components/ai-usage.js:234 |
| KNL-115 | جدول | أحدث تحليلات المستندات | public/assets/js/app/components/ai-usage.js:235 |
| KNL-116 | حالة فارغة | لم يُحلَّل أي مستند بعد. يمكن طلب التحليل من صفحة الملف بجوار كل مستن… | public/assets/js/app/components/ai-usage.js:237 |

## KNF: مادة معرفية (`/app#/knowledge/`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| KNF-01 | سؤال قابل للفتح | عرض | public/assets/js/app/pages/admin/knowledge-detail.js:78 |
| KNF-02 | عنوان | عرض | public/assets/js/app/pages/admin/knowledge-detail.js:78 |
| KNF-03 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/knowledge-detail.js:78 |
| KNF-04 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/knowledge-detail.js:80 |
| KNF-05 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/knowledge-detail.js:80 |
| KNF-06 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/knowledge-detail.js:84 |
| KNF-07 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/knowledge-detail.js:84 |
| KNF-08 | تنبيه | تحقق قبل الاعتماد | public/assets/js/app/pages/admin/knowledge-detail.js:131 |
| KNF-09 | عنصر قائمة | إلغاء | public/assets/js/app/pages/admin/knowledge-detail.js:137 |
| KNF-10 | عنصر قائمة | حفظ نطاق الاستخدام | public/assets/js/app/pages/admin/knowledge-detail.js:155 |
| KNF-11 | نافذة | تعديل نطاق استخدام الحالة | public/assets/js/app/pages/admin/knowledge-detail.js:158 |
| KNF-12 | عنصر قائمة | سبب الاستبعاد | public/assets/js/app/pages/admin/knowledge-detail.js:167 |
| KNF-13 | نافذة | استبعاد الحالة من المعرفة المؤسسية | public/assets/js/app/pages/admin/knowledge-detail.js:169 |
| KNF-14 | زر | اعتماد | public/assets/js/app/pages/admin/knowledge-detail.js:178 |
| KNF-15 | زر | تعديل نطاق الاستخدام | public/assets/js/app/pages/admin/knowledge-detail.js:179 |
| KNF-16 | زر | استبعاد | public/assets/js/app/pages/admin/knowledge-detail.js:180 |
| KNF-17 | نافذة | إعادة بناء السجل من الملف | public/assets/js/app/pages/admin/knowledge-detail.js:191 |
| KNF-18 | زر | إعادة البناء من الملف | public/assets/js/app/pages/admin/knowledge-detail.js:198 |
| KNF-19 | تنبيه | راجع النص للتأكد من إخفاء كل البيانات الشخصية قبل الاعتماد؛ الإخفاء ا… | public/assets/js/app/pages/admin/knowledge-detail.js:222 |
| KNF-20 | تنبيه | بيانات محتملة غير مخفية | public/assets/js/app/pages/admin/knowledge-detail.js:232 |
| KNF-21 | عنوان | إخفاء البيانات الشخصية | public/assets/js/app/pages/admin/knowledge-detail.js:236 |
| KNF-22 | قسم/بطاقة | إخفاء البيانات الشخصية | public/assets/js/app/pages/admin/knowledge-detail.js:237 |
| KNF-23 | قسم/بطاقة | الوسوم | public/assets/js/app/pages/admin/knowledge-detail.js:251 |
| KNF-24 | عنوان | الوسوم | public/assets/js/app/pages/admin/knowledge-detail.js:251 |
| KNF-25 | نافذة | تعديل سجل معتمد | public/assets/js/app/pages/admin/knowledge-detail.js:316 |
| KNF-26 | زر | حفظ التعديلات | public/assets/js/app/pages/admin/knowledge-detail.js:329 |
| KNF-27 | تنبيه | هذا السجل معتمد: تعديل العنوان أو الوقائع أو المسائل أو الإجابات يعيد… | public/assets/js/app/pages/admin/knowledge-detail.js:333 |
| KNF-28 | زر | إلغاء | public/assets/js/app/pages/admin/knowledge-detail.js:335 |
| KNF-29 | زر | تعديل المحتوى | public/assets/js/app/pages/admin/knowledge-detail.js:339 |
| KNF-30 | عنوان | المراجعة والاستخدام | public/assets/js/app/pages/admin/knowledge-detail.js:364 |
| KNF-31 | قسم/بطاقة | المراجعة والاستخدام | public/assets/js/app/pages/admin/knowledge-detail.js:365 |
| KNF-32 | عنوان | ما طُلب من المستفيد/ة أثناء الدراسة | public/assets/js/app/pages/admin/knowledge-detail.js:376 |
| KNF-33 | قسم/بطاقة | ما طُلب من المستفيد/ة أثناء الدراسة | public/assets/js/app/pages/admin/knowledge-detail.js:377 |
| KNF-34 | عنوان | المتخصصون المشاركون | public/assets/js/app/pages/admin/knowledge-detail.js:396 |
| KNF-35 | قسم/بطاقة | المتخصصون المشاركون | public/assets/js/app/pages/admin/knowledge-detail.js:397 |
| KNF-36 | عنصر قائمة | لوحة المتابعة | public/assets/js/app/pages/admin/knowledge-detail.js:409 |
| KNF-37 | عنصر قائمة | المعرفة المؤسسية | public/assets/js/app/pages/admin/knowledge-detail.js:410 |
| KNF-38 | رابط | فتح ملف الاستشارة الأصلي (للإدارة فقط) | public/assets/js/app/pages/admin/knowledge-detail.js:416 |
| KNF-39 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/knowledge-detail.js:419 |
| KNF-40 | عنوان | لوحة المتابعة | public/assets/js/app/pages/admin/knowledge-detail.js:420 |
| KNF-41 | عنوان | المحتوى المجهّل | public/assets/js/app/pages/admin/knowledge-detail.js:427 |
| KNF-42 | قسم/بطاقة | المحتوى المجهّل | public/assets/js/app/pages/admin/knowledge-detail.js:427 |
| KNF-43 | حالة فارغة | قبلت الإدارة والمحامون اقتراحات الذكاء الاصطناعي كما هي في هذه الحالة | public/assets/js/app/pages/admin/knowledge-detail.js:432 |
| KNF-44 | عنوان | تصحيحات الذكاء الاصطناعي في هذه الحالة | public/assets/js/app/pages/admin/knowledge-detail.js:433 |
| KNF-45 | قسم/بطاقة | تصحيحات الذكاء الاصطناعي في هذه الحالة | public/assets/js/app/pages/admin/knowledge-detail.js:434 |
| KNF-46 | عنوان | رحلة الحالة: من الرسالة الأولى حتى الإجابة المعتمدة | public/assets/js/app/pages/admin/knowledge-detail.js:441 |
| KNF-47 | قسم/بطاقة | رحلة الحالة: من الرسالة الأولى حتى الإجابة المعتمدة | public/assets/js/app/pages/admin/knowledge-detail.js:442 |
| KNF-48 | عنصر قائمة | نطاق الاستخدام | public/assets/js/app/pages/admin/knowledge-detail.js:109 |
| KNF-49 | عنصر قائمة | راجعتُ إخفاء البيانات الشخصية، وأؤكد أن النص لا يكشف هوية المستفيد/ة… | public/assets/js/app/pages/admin/knowledge-detail.js:117 |
| KNF-50 | عنصر قائمة | ملاحظة المراجعة (اختياري) | public/assets/js/app/pages/admin/knowledge-detail.js:119 |
| KNF-51 | نموذج | نطاق الاستخدام | public/assets/js/app/pages/admin/knowledge-detail.js:121 |
| KNF-52 | عنصر قائمة | العنوان | public/assets/js/app/pages/admin/knowledge-detail.js:267 |
| KNF-53 | عنصر قائمة | المجال القانوني | public/assets/js/app/pages/admin/knowledge-detail.js:268 |
| KNF-54 | عنصر قائمة | الوسوم | public/assets/js/app/pages/admin/knowledge-detail.js:269 |
| KNF-55 | عنصر قائمة | الوقائع (مجهّلة) | public/assets/js/app/pages/admin/knowledge-detail.js:270 |
| KNF-56 | عنصر قائمة | المسائل القانونية | public/assets/js/app/pages/admin/knowledge-detail.js:271 |
| KNF-57 | عنصر قائمة | الإجابة المعتمدة | public/assets/js/app/pages/admin/knowledge-detail.js:272 |
| KNF-58 | عنصر قائمة | نسخة الرد للمستفيد/ة | public/assets/js/app/pages/admin/knowledge-detail.js:273 |
| KNF-59 | نموذج | العنوان | public/assets/js/app/pages/admin/knowledge-detail.js:275 |

## AIR: اقتراحات الرد (يظهر في: اقتراحات الرد تحت صندوق الكتابة)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| AIR-01 | حقل | (نص متغير) | public/assets/js/app/components/ai-reply.js:30 |
| AIR-02 | زر | (نص متغير) | public/assets/js/app/components/ai-reply.js:72 |
| AIR-03 | حقل | نص الرد المقترح رقم … (… ) — يمكنك تعديله قبل الاستخدام | public/assets/js/app/components/ai-reply.js:102 |
| AIR-04 | زر | استخدام | public/assets/js/app/components/ai-reply.js:139 |
| AIR-05 | زر | تسجيل أن هذا الاقتراح غير مناسب (يساعد على تحسين الاقتراحات) | public/assets/js/app/components/ai-reply.js:152 |
| AIR-06 | حالة فارغة | لم نتمكن من اقتراح رد مناسب لهذا الغرض. يمكنك كتابة الرد يدويًا. | public/assets/js/app/components/ai-reply.js:166 |
| AIR-07 | تنبيه | استُخدمت القوالب المحلية بدل Claude: … | public/assets/js/app/components/ai-reply.js:176 |
| AIR-08 | زر | اقتراحات أخرى | public/assets/js/app/components/ai-reply.js:178 |
| AIR-09 | عنصر قائمة | إغلاق | public/assets/js/app/components/ai-reply.js:192 |
| AIR-10 | نافذة | ردود مقترحة على المستفيد | public/assets/js/app/components/ai-reply.js:193 |
| AIR-11 | زر | ردود مقترحة قصيرة جاهزة للإرسال عبر واتساب | public/assets/js/app/components/ai-reply.js:219 |

## DAI: تحليل المستند بالذكاء الاصطناعي (يظهر في: تحليل المستند في صفحات الملفات)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| DAI-01 | قسم/بطاقة | (نص متغير) | public/assets/js/app/components/doc-ai.js:18 |
| DAI-02 | عنوان | (نص متغير) | public/assets/js/app/components/doc-ai.js:18 |
| DAI-03 | تنبيه | استُبدل ملف المستند بعد هذا التحليل؛ أعد التحليل للحصول على نتيجة محد… | public/assets/js/app/components/doc-ai.js:44 |
| DAI-04 | تنبيه | تحليل مبدئي دون ذكاء اصطناعي | public/assets/js/app/components/doc-ai.js:45 |
| DAI-05 | قسم/بطاقة | الوقائع الرئيسية في المستند | public/assets/js/app/components/doc-ai.js:49 |
| DAI-06 | قسم/بطاقة | ما يثبته المستند للملف | public/assets/js/app/components/doc-ai.js:58 |
| DAI-07 | قسم/بطاقة | ملاحظات تحتاج إلى انتباه | public/assets/js/app/components/doc-ai.js:60 |
| DAI-08 | قسم/بطاقة | مستندات مرتبطة يُستحسن طلبها | public/assets/js/app/components/doc-ai.js:70 |
| DAI-09 | زر | صورة … | public/assets/js/app/components/doc-ai.js:78 |
| DAI-10 | زر | تحليل نوع المستند ووقائعه وما يثبته والملاحظات عليه | public/assets/js/app/components/doc-ai.js:100 |
| DAI-11 | زر | إعادة التحليل | public/assets/js/app/components/doc-ai.js:138 |
| DAI-12 | زر | عرض المستند | public/assets/js/app/components/doc-ai.js:149 |
| DAI-13 | عنصر قائمة | إغلاق | public/assets/js/app/components/doc-ai.js:150 |
| DAI-14 | نافذة | تحليل المستند | public/assets/js/app/components/doc-ai.js:150 |
| DAI-15 | تنبيه | (نص متغير) | public/assets/js/app/components/doc-ai.js:156 |

## DOC: عارض المستندات: النسخة المحسّنة والأصل والنص (يظهر في: عارض المستندات في الطلب والملف والملف المستمر وطلبات الشركات)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| DOC-01 | قسم/بطاقة | (نص متغير) | public/assets/js/app/components/doc-viewer.js:222 |
| DOC-02 | زر | اعرض النسخة المحسّنة | public/assets/js/app/components/doc-viewer.js:267 |
| DOC-03 | نص | السابقة | public/assets/js/app/components/doc-viewer.js:282 |
| DOC-04 | رابط | فتح ملف PDF | public/assets/js/app/components/doc-viewer.js:245 |
| DOC-05 | زر | نظّفه مرة أخرى | public/assets/js/app/components/doc-clean.js:325 |
| DOC-06 | زر | نظّفه مرة أخرى | public/assets/js/app/components/doc-clean.js:325 |
| DOC-07 | زر | رجّع الأصل | public/assets/js/app/components/doc-clean.js:331 |
| DOC-08 | زر | اعرض النسخة المحسّنة | public/assets/js/app/components/doc-clean.js:332 |
| DOC-09 | زر | تفاصيل النسخ | public/assets/js/app/components/doc-clean.js:336 |
| DOC-10 | نص | لا توجد نسخ أخرى لهذا المستند. | public/assets/js/app/components/doc-clean.js:285 |
| DOC-11 | قسم/بطاقة | (نص متغير) | public/assets/js/app/components/doc-clean.js:362 |
| DOC-12 | زر | النص | public/assets/js/app/components/doc-clean.js:359 · public/assets/js/app/components/doc-viewer.js:190 |
| DOC-13 | قسم/بطاقة | جارٍ التحميل… | public/assets/js/app/components/doc-clean.js:83 |
| DOC-14 | قسم/بطاقة | (نص متغير) | public/assets/js/app/components/doc-clean.js:98 |
| DOC-15 | خيار | (نص متغير) | public/assets/js/app/components/doc-viewer.js:385 |
| DOC-16 | نص | (نص متغير) | public/assets/js/app/components/doc-viewer.js:80 · public/assets/js/app/components/doc-viewer.js:289 |
| DOC-17 | نص | (نص متغير) | public/assets/js/app/components/doc-viewer.js:81 |
| DOC-18 | زر | (نص متغير) | public/assets/js/app/components/doc-viewer.js:175 |
| DOC-19 | نافذة | تنزيل على الهاتف | public/assets/js/app/components/doc-viewer.js:193 |
| DOC-20 | زر | تنزيل | public/assets/js/app/components/doc-viewer.js:215 |
| DOC-21 | زر | السابقة | public/assets/js/app/components/doc-viewer.js:283 |
| DOC-22 | زر | التالية | public/assets/js/app/components/doc-viewer.js:285 |
| DOC-23 | نافذة | (نص متغير) | public/assets/js/app/components/doc-viewer.js:350 |
| DOC-24 | زر | رجوع | public/assets/js/app/components/doc-viewer.js:354 |
| DOC-25 | زر | خيارات المستند | public/assets/js/app/components/doc-viewer.js:355 |
| DOC-26 | زر | عرض | public/assets/js/app/components/doc-viewer.js:385 |
| DOC-27 | زر | تنزيل … | public/assets/js/app/components/doc-viewer.js:427 |
| DOC-28 | زر | خيارات … | public/assets/js/app/components/doc-viewer.js:439 |
| DOC-29 | عنصر قائمة | طريقة الإرسال | public/assets/js/app/components/send-document.js:43 |
| DOC-30 | عنصر قائمة | نص مرافق (اختياري) | public/assets/js/app/components/send-document.js:52 |
| DOC-31 | نافذة | إرسال مستند | public/assets/js/app/components/send-document.js:60 |
| DOC-32 | زر | إرسال « | public/assets/js/app/components/send-document.js:85 |
| DOC-33 | زر | طُلبت قراءة النص. تظهر خلال دقائق. | public/assets/js/app/components/doc-clean.js:116 |
| DOC-34 | زر | نسخ | public/assets/js/app/components/doc-clean.js:140 |
| DOC-35 | حقل | تصحيح نص الصفحة … | public/assets/js/app/components/doc-clean.js:146 |
| DOC-36 | زر | حُفظ التصحيح | public/assets/js/app/components/doc-clean.js:162 |
| DOC-37 | زر | إلغاء | public/assets/js/app/components/doc-clean.js:166 |
| DOC-38 | زر | تصحيح نص الصفحة … | public/assets/js/app/components/doc-clean.js:170 |
| DOC-39 | نافذة | النص المقروء آليًا | public/assets/js/app/components/doc-clean.js:203 |
| DOC-41 | نص | ١٢٣ | public/assets/js/app/components/doc-clean.js:138 |

## VTR: تفريغ الرسالة الصوتية والنص الآلي (يظهر في: الرسائل الصوتية في المحادثة وصفحة الطلب)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| VTR-01 | قسم/بطاقة | (نص متغير) | public/assets/js/app/components/voice-transcript.js:86 |
| VTR-02 | نص | نص آلي للمراجعة | public/assets/js/app/components/voice-transcript.js:331 |
| VTR-03 | نص | النص الآلي غير مؤكد. استمع إلى الرسالة قبل التأكيد. | public/assets/js/app/components/voice-transcript.js:219 |
| VTR-04 | حقل | (نص متغير) | public/assets/js/app/components/voice-transcript.js:178 |
| VTR-05 | عنصر | (نص متغير) | public/assets/js/app/components/voice-transcript.js:197 |
| VTR-06 | عنصر | (نص متغير) | public/assets/js/app/components/voice-transcript.js:199 |
| VTR-07 | نص | جارٍ التحويل إلى نص… | public/assets/js/app/components/voice-transcript.js:165 |
| VTR-08 | زر | حوّل الآن | public/assets/js/app/components/voice-transcript.js:167 |
| VTR-09 | نص | استمع إلى الرسالة أولًا. | public/assets/js/app/components/voice-transcript.js:181 |
| VTR-10 | نص | لا يوجد كلام مفهوم | public/assets/js/app/components/voice-transcript.js:220 |
| VTR-11 | حقل | (نص متغير) | public/assets/js/app/components/voice-transcript.js:65 |
| VTR-12 | زر | اكتب ما سمعته أولًا، أو اختر «الرسالة غير مفهومة». | public/assets/js/app/components/voice-transcript.js:195 |
| VTR-13 | زر | الرسالة غير مفهومة | public/assets/js/app/components/voice-transcript.js:198 |
| VTR-14 | حقل | اكتب ما قالته المستفيدة بكلامها | public/assets/js/app/components/voice-transcript.js:238 |
| VTR-15 | زر | حفظ النص | public/assets/js/app/components/voice-transcript.js:256 |
| VTR-16 | زر | الرسالة مش مفهومة | public/assets/js/app/components/voice-transcript.js:258 |
| VTR-17 | زر | إلغاء | public/assets/js/app/components/voice-transcript.js:284 |
| VTR-18 | زر | تعديل | public/assets/js/app/components/voice-transcript.js:305 |

## ANL: التسويق والتحليلات (`/app#/analytics`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| ANL-01 | حقل | نوع الطلب | public/assets/js/app/pages/admin/analytics.js:465 |
| ANL-02 | قسم/بطاقة | كم زائرًا فتح كل صفحة من الصفحة الأولى، وكم طلبًا وصل من كل مسار في ا… | public/assets/js/app/pages/admin/analytics.js:25 |
| ANL-03 | جدول | زيارات صفحات الاختيار | public/assets/js/app/pages/admin/analytics.js:38 |
| ANL-04 | جدول | الطلبات حسب المسار | public/assets/js/app/pages/admin/analytics.js:53 |
| ANL-05 | نص | (نص متغير) | public/assets/js/app/pages/admin/analytics.js:34 |
| ANL-06 | نص | (نص متغير) | public/assets/js/app/pages/admin/analytics.js:66 |
| ANL-07 | عنصر قائمة | الصفحة | public/assets/js/app/pages/admin/analytics.js:45 |
| ANL-08 | عنصر قائمة | الزيارات | public/assets/js/app/pages/admin/analytics.js:46 |
| ANL-09 | عنصر قائمة | من الصفحة السابقة | public/assets/js/app/pages/admin/analytics.js:47 |
| ANL-10 | جدول | زيارات صفحات الاختيار | public/assets/js/app/pages/admin/analytics.js:49 |
| ANL-11 | عنصر قائمة | المسار | public/assets/js/app/pages/admin/analytics.js:60 |
| ANL-12 | عنصر قائمة | الطلبات | public/assets/js/app/pages/admin/analytics.js:61 |
| ANL-13 | جدول | الطلبات حسب المسار | public/assets/js/app/pages/admin/analytics.js:63 |
| ANL-14 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/analytics.js:68 |
| ANL-15 | سؤال قابل للفتح | عرض البيانات كجدول | public/assets/js/app/pages/admin/analytics.js:180 |
| ANL-16 | عنوان | عرض البيانات كجدول | public/assets/js/app/pages/admin/analytics.js:180 |
| ANL-17 | عنصر قائمة | الأسبوع الذي يبدأ في | public/assets/js/app/pages/admin/analytics.js:185 |
| ANL-18 | جدول | الحجم الأسبوعي | public/assets/js/app/pages/admin/analytics.js:188 |
| ANL-19 | جدول | الحجم الأسبوعي | public/assets/js/app/pages/admin/analytics.js:189 |
| ANL-20 | زر | آخر 90 يومًا | public/assets/js/app/pages/admin/analytics.js:244 |
| ANL-21 | حالة فارغة | لا توجد طلبات واردة في الفترة المختارة | public/assets/js/app/pages/admin/analytics.js:244 |
| ANL-22 | قسم/بطاقة | لا توجد طلبات واردة في الفترة المختارة | public/assets/js/app/pages/admin/analytics.js:244 |
| ANL-23 | بطاقة رقم | رسائل واردة | public/assets/js/app/pages/admin/analytics.js:252 |
| ANL-24 | بطاقة رقم | طلبات واردة | public/assets/js/app/pages/admin/analytics.js:253 |
| ANL-25 | بطاقة رقم | استشارات قانونية | public/assets/js/app/pages/admin/analytics.js:254 |
| ANL-26 | بطاقة رقم | عولجت داخليًا | public/assets/js/app/pages/admin/analytics.js:255 |
| ANL-27 | بطاقة رقم | تحولت إلى ملفات | public/assets/js/app/pages/admin/analytics.js:256 |
| ANL-28 | بطاقة رقم | احتاجت محاميًا | public/assets/js/app/pages/admin/analytics.js:257 |
| ANL-29 | بطاقة رقم | فريق متعدد التخصصات | public/assets/js/app/pages/admin/analytics.js:258 |
| ANL-30 | بطاقة رقم | ملفات عمل مستمرة | public/assets/js/app/pages/admin/analytics.js:259 |
| ANL-31 | بطاقة رقم | ملفات أُغلقت | public/assets/js/app/pages/admin/analytics.js:260 |
| ANL-32 | بطاقة رقم | تكلفة الملفات | public/assets/js/app/pages/admin/analytics.js:261 |
| ANL-33 | بطاقة رقم | الإنفاق الإعلاني | public/assets/js/app/pages/admin/analytics.js:269 |
| ANL-34 | عنوان | ماذا حدث للطلبات الواردة؟ | public/assets/js/app/pages/admin/analytics.js:288 |
| ANL-35 | قسم/بطاقة | ماذا حدث للطلبات الواردة؟ | public/assets/js/app/pages/admin/analytics.js:289 |
| ANL-36 | عنصر قائمة | (نص متغير) | public/assets/js/app/pages/admin/analytics.js:311 |
| ANL-37 | عنصر قائمة | الحجم | public/assets/js/app/pages/admin/analytics.js:317 |
| ANL-38 | عنصر قائمة | مسار الطلبات | public/assets/js/app/pages/admin/analytics.js:334 |
| ANL-39 | عنصر قائمة | نتائج أخرى | public/assets/js/app/pages/admin/analytics.js:346 |
| ANL-40 | عنصر قائمة | التحويل إلى ملف | public/assets/js/app/pages/admin/analytics.js:358 |
| ANL-41 | عنصر قائمة | الإنفاق الإعلاني | public/assets/js/app/pages/admin/analytics.js:373 |
| ANL-42 | عنصر قائمة | التكلفة | public/assets/js/app/pages/admin/analytics.js:385 |
| ANL-43 | جدول | قمع التحويل حسب … | public/assets/js/app/pages/admin/analytics.js:388 |
| ANL-44 | جدول | قمع التحويل حسب … | public/assets/js/app/pages/admin/analytics.js:389 |
| ANL-45 | عنوان | النتائج حسب | public/assets/js/app/pages/admin/analytics.js:391 |
| ANL-46 | قسم/بطاقة | النتائج حسب | public/assets/js/app/pages/admin/analytics.js:392 |
| ANL-47 | زر | حسب … | public/assets/js/app/pages/admin/analytics.js:426 |
| ANL-48 | حقل | (نص متغير) | public/assets/js/app/pages/admin/analytics.js:433 |
| ANL-49 | حقل | (نص متغير) | public/assets/js/app/pages/admin/analytics.js:434 |
| ANL-50 | حقل | من تاريخ | public/assets/js/app/pages/admin/analytics.js:483 |
| ANL-51 | حقل | إلى تاريخ | public/assets/js/app/pages/admin/analytics.js:484 |
| ANL-52 | زر | آخر 90 يومًا | public/assets/js/app/pages/admin/analytics.js:485 |
| ANL-53 | تنبيه | أكثر المجالات احتياجًا لفريق متعدد التخصصات: … (… من … ). | public/assets/js/app/pages/admin/analytics.js:534 |
| ANL-54 | عنصر قائمة | المجال | public/assets/js/app/pages/admin/analytics.js:541 |
| ANL-55 | عنصر قائمة | الملفات | public/assets/js/app/pages/admin/analytics.js:547 |
| ANL-56 | عنصر قائمة | مغلقة | public/assets/js/app/pages/admin/analytics.js:549 |
| ANL-57 | عنصر قائمة | متعددة التخصصات | public/assets/js/app/pages/admin/analytics.js:555 |
| ANL-58 | عنصر قائمة | تحولت لعمل مستمر | public/assets/js/app/pages/admin/analytics.js:557 |
| ANL-59 | جدول | الملفات حسب المجال | public/assets/js/app/pages/admin/analytics.js:559 |
| ANL-60 | جدول | الملفات حسب المجال | public/assets/js/app/pages/admin/analytics.js:560 |
| ANL-61 | عنوان | الملفات حسب المجال القانوني | public/assets/js/app/pages/admin/analytics.js:563 |
| ANL-62 | قسم/بطاقة | الملفات حسب المجال القانوني | public/assets/js/app/pages/admin/analytics.js:564 |
| ANL-63 | حالة فارغة | لا توجد بيانات أسبوعية بعد | public/assets/js/app/pages/admin/analytics.js:571 |
| ANL-64 | عنوان | الحجم الأسبوعي — آخر 12 أسبوعًا | public/assets/js/app/pages/admin/analytics.js:572 |
| ANL-65 | قسم/بطاقة | الحجم الأسبوعي — آخر 12 أسبوعًا | public/assets/js/app/pages/admin/analytics.js:573 |
| ANL-66 | عنصر قائمة | الشهر | public/assets/js/app/pages/admin/analytics.js:610 |
| ANL-67 | عنصر قائمة | المصدر | public/assets/js/app/pages/admin/analytics.js:611 |
| ANL-68 | عنصر قائمة | الحملة | public/assets/js/app/pages/admin/analytics.js:612 |
| ANL-69 | عنصر قائمة | المبلغ المنفق (ج.م) | public/assets/js/app/pages/admin/analytics.js:613 |
| ANL-70 | عنصر قائمة | ملاحظة | public/assets/js/app/pages/admin/analytics.js:614 |
| ANL-71 | نافذة | تعديل الإنفاق | public/assets/js/app/pages/admin/analytics.js:620 |
| ANL-72 | زر | تسجيل إنفاق | public/assets/js/app/pages/admin/analytics.js:638 |
| ANL-73 | عنصر قائمة | الشهر | public/assets/js/app/pages/admin/analytics.js:646 |
| ANL-74 | عنصر قائمة | المصدر | public/assets/js/app/pages/admin/analytics.js:647 |
| ANL-75 | عنصر قائمة | الحملة | public/assets/js/app/pages/admin/analytics.js:648 |
| ANL-76 | عنصر قائمة | المبلغ | public/assets/js/app/pages/admin/analytics.js:649 |
| ANL-77 | زر | تعديل | public/assets/js/app/pages/admin/analytics.js:657 |
| ANL-78 | نافذة | حذف سجل الإنفاق | public/assets/js/app/pages/admin/analytics.js:663 |
| ANL-79 | زر | حذف | public/assets/js/app/pages/admin/analytics.js:673 |
| ANL-80 | عنصر قائمة | تعديل | public/assets/js/app/pages/admin/analytics.js:676 |
| ANL-81 | جدول | سجلات الإنفاق الإعلاني | public/assets/js/app/pages/admin/analytics.js:679 |
| ANL-82 | جدول | سجلات الإنفاق الإعلاني | public/assets/js/app/pages/admin/analytics.js:680 |
| ANL-83 | عنوان | الإنفاق على الإعلانات | public/assets/js/app/pages/admin/analytics.js:683 |
| ANL-84 | قسم/بطاقة | الإنفاق على الإعلانات | public/assets/js/app/pages/admin/analytics.js:684 |
| ANL-85 | عنصر قائمة | لوحة المتابعة | public/assets/js/app/pages/admin/analytics.js:694 |
| ANL-86 | عنوان | التسويق والتحليلات | public/assets/js/app/pages/admin/analytics.js:695 |
| ANL-87 | عنوان | التسويق والتحليلات | public/assets/js/app/pages/admin/analytics.js:696 |

## SIM: محاكي واتساب (`/app#/simulator`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| SIM-01 | قسم/بطاقة | أزرار قائمة الخدمات: اضغط كما يضغطها صاحب الرسالة | public/assets/js/app/pages/admin/simulator.js:220 |
| SIM-02 | قسم/بطاقة | صفوف قائمة الخدمات: اضغط كما يضغطها صاحب الرسالة | public/assets/js/app/pages/admin/simulator.js:209 |
| SIM-03 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/simulator.js:277 |
| SIM-04 | نص | (نص متغير) | public/assets/js/app/pages/admin/simulator.js:279 |
| SIM-05 | زر | (نص متغير) | public/assets/js/app/pages/admin/simulator.js:99 |
| SIM-06 | عنوان | ردّنا الآلي على هذه الرسالة | public/assets/js/app/pages/admin/simulator.js:194 |
| SIM-07 | زر | (نص متغير) | public/assets/js/app/pages/admin/simulator.js:212 |
| SIM-08 | زر | (نص متغير) | public/assets/js/app/pages/admin/simulator.js:223 |
| SIM-09 | تنبيه | (نص متغير) | public/assets/js/app/pages/admin/simulator.js:261 |
| SIM-10 | زر | فتح الطلب في صندوق الوارد | public/assets/js/app/pages/admin/simulator.js:289 |
| SIM-11 | زر | فتح الملف | public/assets/js/app/pages/admin/simulator.js:290 |
| SIM-12 | عنوان | نتيجة المحاكاة | public/assets/js/app/pages/admin/simulator.js:301 |
| SIM-13 | قسم/بطاقة | نتيجة المحاكاة | public/assets/js/app/pages/admin/simulator.js:302 |
| SIM-14 | رابط | الطلب | public/assets/js/app/pages/admin/simulator.js:317 |
| SIM-15 | رابط | الملف | public/assets/js/app/pages/admin/simulator.js:318 |
| SIM-16 | عنوان | رسائل هذه الجلسة | public/assets/js/app/pages/admin/simulator.js:323 |
| SIM-17 | قسم/بطاقة | رسائل هذه الجلسة | public/assets/js/app/pages/admin/simulator.js:324 |
| SIM-18 | حقل | رقم الطلب من الموقع | public/assets/js/app/pages/admin/simulator.js:332 |
| SIM-19 | حقل | (نص متغير) | public/assets/js/app/pages/admin/simulator.js:333 |
| SIM-20 | زر | تجهيز | public/assets/js/app/pages/admin/simulator.js:395 |
| SIM-21 | زر | (نص متغير) | public/assets/js/app/pages/admin/simulator.js:436 |
| SIM-22 | عنوان | سيناريوهات جاهزة | public/assets/js/app/pages/admin/simulator.js:448 |
| SIM-23 | قسم/بطاقة | سيناريوهات جاهزة | public/assets/js/app/pages/admin/simulator.js:449 |
| SIM-24 | عنوان | ماذا يحدث للرسالة؟ | public/assets/js/app/pages/admin/simulator.js:473 |
| SIM-25 | قسم/بطاقة | ماذا يحدث للرسالة؟ | public/assets/js/app/pages/admin/simulator.js:474 |
| SIM-26 | زر | (نص متغير) | public/assets/js/app/pages/admin/simulator.js:489 |
| SIM-27 | عنوان | متغيرات البيئة المطلوبة | public/assets/js/app/pages/admin/simulator.js:490 |
| SIM-28 | عنوان | الربط الفعلي مع واتساب | public/assets/js/app/pages/admin/simulator.js:494 |
| SIM-29 | قسم/بطاقة | الربط الفعلي مع واتساب | public/assets/js/app/pages/admin/simulator.js:495 |
| SIM-30 | زر | إرسال رسالة صوتية تجريبية | public/assets/js/app/pages/admin/simulator.js:502 |
| SIM-31 | زر | إرسال صورة ورقة | public/assets/js/app/pages/admin/simulator.js:503 |
| SIM-32 | زر | خلاص | public/assets/js/app/pages/admin/simulator.js:504 |
| SIM-33 | زر | (نص متغير) | public/assets/js/app/pages/admin/simulator.js:514 |
| SIM-34 | سؤال قابل للفتح | عرض شكل الـ Webhook المرسل (صيغة Meta) | public/assets/js/app/pages/admin/simulator.js:522 |
| SIM-35 | عنوان | عرض شكل الـ Webhook المرسل (صيغة Meta) | public/assets/js/app/pages/admin/simulator.js:522 |
| SIM-36 | عنصر قائمة | لوحة المتابعة | public/assets/js/app/pages/admin/simulator.js:534 |
| SIM-37 | زر | صندوق الوارد | public/assets/js/app/pages/admin/simulator.js:536 |
| SIM-38 | عنوان | محاكي واتساب | public/assets/js/app/pages/admin/simulator.js:537 |
| SIM-39 | عنوان | محاكي واتساب | public/assets/js/app/pages/admin/simulator.js:538 |
| SIM-40 | عنوان | رسالة واتساب واردة | public/assets/js/app/pages/admin/simulator.js:545 |
| SIM-41 | قسم/بطاقة | رسالة واتساب واردة | public/assets/js/app/pages/admin/simulator.js:545 |
| SIM-42 | عنصر قائمة | رقم المرسل | public/assets/js/app/pages/admin/simulator.js:112 |
| SIM-43 | عنصر قائمة | اسم المرسل كما يظهر في واتساب | public/assets/js/app/pages/admin/simulator.js:113 |
| SIM-44 | عنصر قائمة | نص الرسالة | public/assets/js/app/pages/admin/simulator.js:114 |
| SIM-45 | عنصر قائمة | جاءت الرسالة من إعلان ممول (Click-to-WhatsApp) | public/assets/js/app/pages/admin/simulator.js:121 |
| SIM-46 | عنصر قائمة | منصة الإعلان | public/assets/js/app/pages/admin/simulator.js:132 |
| SIM-47 | عنصر قائمة | عنوان الإعلان | public/assets/js/app/pages/admin/simulator.js:134 |
| SIM-48 | عنصر قائمة | رقم الإعلان (اختياري) | public/assets/js/app/pages/admin/simulator.js:135 |
| SIM-49 | زر | إرسال عبر المحاكي | public/assets/js/app/pages/admin/simulator.js:148 |
| SIM-50 | نموذج | رقم المرسل | public/assets/js/app/pages/admin/simulator.js:149 |

## SET: الإعدادات والمستخدمون (كل البطاقات) (`/app#/settings`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| SET-01 | عنصر | (نص متغير) | public/assets/js/app/components/site-settings.js:369 |
| SET-02 | حقل | (نص متغير) | public/assets/js/app/components/site-settings.js:237 |
| SET-03 | نص | (نص متغير) | public/assets/js/app/components/site-settings.js:238 |
| SET-04 | قسم/بطاقة | (نص متغير) | public/assets/js/app/components/site-settings.js:247 |
| SET-05 | عنصر | صفحة تقول إن الخدمة متوقفة | public/assets/js/app/components/site-settings.js:129 |
| SET-06 | عنصر | تحويل إلى الصفحة الأولى | public/assets/js/app/components/site-settings.js:130 |
| SET-07 | عنصر | (نص متغير) | public/assets/js/app/components/site-settings.js:349 |
| SET-08 | عنصر | (نص متغير) | public/assets/js/app/components/site-settings.js:350 |
| SET-09 | زر | معاينة | public/assets/js/app/components/site-settings.js:357 |
| SET-10 | عنصر | (نص متغير) | public/assets/js/app/components/site-settings.js:352 |
| SET-11 | عنصر | (نص متغير) | public/assets/js/app/components/site-settings.js:353 |
| SET-12 | عنصر | (نص متغير) | public/assets/js/app/components/site-settings.js:354 |
| SET-13 | قسم/بطاقة | (نص متغير) | public/assets/js/app/components/site-settings.js:216 |
| SET-14 | زر | إضافة شريك | public/assets/js/app/components/site-settings.js:166 |
| SET-15 | عنصر | (نص متغير) | public/assets/js/app/components/site-settings.js:355 |
| SET-16 | عنصر | (نص متغير) | public/assets/js/app/components/story-settings.js:121 |
| SET-17 | زر | أعلى | public/assets/js/app/components/site-settings.js:185 |
| SET-18 | زر | أسفل | public/assets/js/app/components/site-settings.js:186 |
| SET-19 | زر | حذف | public/assets/js/app/components/site-settings.js:187 |
| SET-20 | عنصر | (نص متغير) | public/assets/js/app/components/media-settings.js:142 |
| SET-21 | عنصر | (نص متغير) | public/assets/js/app/components/media-settings.js:143 |
| SET-22 | عنصر | (نص متغير) | public/assets/js/app/components/media-settings.js:144 |
| SET-23 | عنصر | (نص متغير) | public/assets/js/app/components/media-settings.js:145 |
| SET-24 | نص | تحويل الصوت عند جهة خارجية معلن منذ | public/assets/js/app/components/media-settings.js:65 |
| SET-25 | عنصر | (نص متغير) | public/assets/js/app/components/media-settings.js:146 |
| SET-26 | عنصر | (نص متغير) | public/assets/js/app/components/media-settings.js:147 |
| SET-27 | عنصر | (نص متغير) | public/assets/js/app/components/media-settings.js:148 |
| SET-28 | عنصر | (نص متغير) | public/assets/js/app/components/media-settings.js:149 |
| SET-29 | عنصر | (نص متغير) | public/assets/js/app/components/media-settings.js:150 |
| SET-30 | عنصر | (نص متغير) | public/assets/js/app/components/media-settings.js:151 |
| SET-31 | عنصر | (نص متغير) | public/assets/js/app/components/media-settings.js:152 |
| SET-32 | عنصر | (نص متغير) | public/assets/js/app/components/media-settings.js:153 |
| SET-33 | نص | قراءة المستندات بـ Claude معلنة منذ | public/assets/js/app/components/media-settings.js:66 |
| SET-34 | عنصر | (نص متغير) | public/assets/js/app/components/media-settings.js:180 |
| SET-35 | عنصر | (نص متغير) | public/assets/js/app/components/media-settings.js:155 |
| SET-40 | رابط | صفحة قوالب واتساب | public/assets/js/app/pages/admin/settings.js:125 |
| SET-41 | زر | إدارة التكاملات | public/assets/js/app/pages/admin/settings.js:218 |
| SET-42 | عنوان | حالة التكاملات | public/assets/js/app/pages/admin/settings.js:220 |
| SET-43 | قسم/بطاقة | حالة التكاملات | public/assets/js/app/pages/admin/settings.js:221 |
| SET-44 | عنصر قائمة | لوحة المتابعة | public/assets/js/app/pages/admin/settings.js:233 |
| SET-45 | عنوان | الإعدادات والمستخدمون | public/assets/js/app/pages/admin/settings.js:234 |
| SET-46 | عنوان | الإعدادات والمستخدمون | public/assets/js/app/pages/admin/settings.js:235 |
| SET-47 | عنوان | إعدادات المؤسسة | public/assets/js/app/pages/admin/settings.js:237 |
| SET-48 | قسم/بطاقة | إعدادات المؤسسة | public/assets/js/app/pages/admin/settings.js:237 |
| SET-49 | زر | عرض الموقع | public/assets/js/app/components/site-settings.js:111 |
| SET-50 | عنوان | الموقع العام وبيانات التواصل | public/assets/js/app/components/site-settings.js:113 |
| SET-51 | قسم/بطاقة | الموقع العام وبيانات التواصل | public/assets/js/app/components/site-settings.js:114 |
| SET-52 | حقل | اسم الشريك … | public/assets/js/app/components/site-settings.js:174 |
| SET-53 | حقل | مثال: … | public/assets/js/app/components/site-settings.js:175 |
| SET-54 | حقل | الاسم | public/assets/js/app/components/site-settings.js:200 |
| SET-55 | حقل | الصفة | public/assets/js/app/components/site-settings.js:200 |
| SET-56 | نافذة | (نص متغير) | public/assets/js/app/components/site-settings.js:261 |
| SET-57 | عنوان | (نص متغير) | public/assets/js/app/components/site-settings.js:365 |
| SET-58 | قسم/بطاقة | أول ما يراه الزائر: ثلاثة اختيارات (استشارة، رفع دعوى قضائية، تأسيس ش… | public/assets/js/app/components/site-settings.js:366 |
| SET-59 | عنوان | القصص الواردة على واتساب | public/assets/js/app/components/story-settings.js:145 |
| SET-60 | قسم/بطاقة | القصص الواردة على واتساب | public/assets/js/app/components/story-settings.js:146 |
| SET-61 | رسالة | color | public/assets/js/app/components/brand-settings.js:165 |
| SET-62 | رسالة | hex | public/assets/js/app/components/brand-settings.js:165 |
| SET-63 | حقل | (نص متغير) | public/assets/js/app/components/brand-settings.js:244 |
| SET-64 | زر | اختر صورة الشعار لاقتراح الألوان | public/assets/js/app/components/brand-settings.js:247 |
| SET-65 | زر | (نص متغير) | public/assets/js/app/components/brand-settings.js:280 |
| SET-66 | عنوان | معاينة | public/assets/js/app/components/brand-settings.js:302 |
| SET-67 | زر | حفظ الألوان | public/assets/js/app/components/brand-settings.js:332 |
| SET-68 | زر | رجوع للألوان الأصلية | public/assets/js/app/components/brand-settings.js:333 |
| SET-69 | نافذة | الرجوع للألوان الأصلية؟ | public/assets/js/app/components/brand-settings.js:401 |
| SET-70 | عنوان | ألوان المؤسسة | public/assets/js/app/components/brand-settings.js:430 |
| SET-71 | قسم/بطاقة | ألوان المؤسسة | public/assets/js/app/components/brand-settings.js:430 |
| SET-72 | تنبيه | البريد غير مُعدّ للشركات | public/assets/js/app/components/email-settings.js:54 |
| SET-73 | تنبيه | PUBLIC_BASE_URL غير مضبوط على الخادم: لا تُرسل روابط الدعوات وتعيين ك… | public/assets/js/app/components/email-settings.js:55 |
| SET-74 | تنبيه | تغيّر مفتاح التشفير بعد حفظ كلمة مرور SMTP فلم يعد ممكنًا فك تشفيرها.… | public/assets/js/app/components/email-settings.js:56 |
| SET-75 | تنبيه | (نص متغير) | public/assets/js/app/components/email-settings.js:68 |
| SET-76 | زر | إرسال رسالة تجربة إلى بريدي | public/assets/js/app/components/email-settings.js:71 |
| SET-77 | زر | تعديل | public/assets/js/app/components/email-settings.js:78 |
| SET-78 | عنوان | رسالة التجربة | public/assets/js/app/components/email-settings.js:92 |
| SET-79 | عنوان | البريد الإلكتروني | public/assets/js/app/components/email-settings.js:95 |
| SET-80 | قسم/بطاقة | البريد الإلكتروني | public/assets/js/app/components/email-settings.js:96 |
| SET-81 | تنبيه | أُرسلت رسالة التجربة. | public/assets/js/app/components/email-settings.js:102 |
| SET-82 | حقل | (نص متغير) | public/assets/js/app/components/email-settings.js:117 |
| SET-83 | عنصر قائمة | إلغاء | public/assets/js/app/components/email-settings.js:172 |
| SET-84 | تنبيه | لم تغيّر أي قيمة. | public/assets/js/app/components/email-settings.js:195 |
| SET-85 | تنبيه | (نص متغير) | public/assets/js/app/components/email-settings.js:203 |
| SET-86 | عنصر قائمة | حفظ الإعدادات | public/assets/js/app/components/email-settings.js:207 |
| SET-87 | نافذة | ضبط البريد الإلكتروني | public/assets/js/app/components/email-settings.js:216 |
| SET-88 | تنبيه | الإرسال الآن «صندوق صادر فقط»: تُسجَّل الرسائل هنا ولا تصل إلى أحد. ا… | public/assets/js/app/components/email-settings.js:237 |
| SET-89 | عنصر قائمة | الوقت | public/assets/js/app/components/email-settings.js:249 |
| SET-90 | عنصر قائمة | إلى | public/assets/js/app/components/email-settings.js:250 |
| SET-91 | عنصر قائمة | الغرض | public/assets/js/app/components/email-settings.js:251 |
| SET-92 | عنصر قائمة | الحالة | public/assets/js/app/components/email-settings.js:252 |
| SET-93 | عنصر قائمة | السبب | public/assets/js/app/components/email-settings.js:253 |
| SET-94 | جدول | صادر البريد | public/assets/js/app/components/email-settings.js:255 |
| SET-95 | حالة فارغة | لا رسائل بريد بهذا الاختيار. | public/assets/js/app/components/email-settings.js:257 |
| SET-96 | حقل | الحالة | public/assets/js/app/components/email-settings.js:275 |
| SET-97 | زر | تحديث | public/assets/js/app/components/email-settings.js:277 |
| SET-98 | حقل | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:61 |
| SET-99 | حقل | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:64 |
| SET-100 | حقل | … : من | public/assets/js/app/components/company-b2b-settings.js:65 |
| SET-101 | حقل | … : إلى | public/assets/js/app/components/company-b2b-settings.js:66 |
| SET-102 | عنوان | خدمة الشركات | public/assets/js/app/components/company-b2b-settings.js:106 |
| SET-103 | قسم/بطاقة | خدمة الشركات | public/assets/js/app/components/company-b2b-settings.js:107 |
| SET-104 | حقل | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:130 |
| SET-105 | حقل | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:137 |
| SET-106 | حقل | تاريخ عطلة | public/assets/js/app/components/company-b2b-settings.js:150 |
| SET-107 | زر | حذف … | public/assets/js/app/components/company-b2b-settings.js:157 |
| SET-108 | زر | إضافة | public/assets/js/app/components/company-b2b-settings.js:174 |
| SET-109 | تنبيه | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:241 |
| SET-110 | زر | حفظ إعدادات خدمة الشركات | public/assets/js/app/components/company-b2b-settings.js:252 |
| SET-111 | قسم/بطاقة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:254 |
| SET-112 | عنوان | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:254 |
| SET-113 | زر | باقة جديدة | public/assets/js/app/components/company-b2b-settings.js:293 |
| SET-114 | عنوان | باقات الشركات | public/assets/js/app/components/company-b2b-settings.js:295 |
| SET-115 | قسم/بطاقة | باقات الشركات | public/assets/js/app/components/company-b2b-settings.js:296 |
| SET-116 | عنصر قائمة | الباقة | public/assets/js/app/components/company-b2b-settings.js:312 |
| SET-117 | عنصر قائمة | الشروط | public/assets/js/app/components/company-b2b-settings.js:313 |
| SET-118 | عنصر قائمة | الشركات | public/assets/js/app/components/company-b2b-settings.js:314 |
| SET-119 | عنصر قائمة | الحالة | public/assets/js/app/components/company-b2b-settings.js:315 |
| SET-120 | زر | تعديل | public/assets/js/app/components/company-b2b-settings.js:316 |
| SET-121 | عنصر قائمة | إجراءات | public/assets/js/app/components/company-b2b-settings.js:316 |
| SET-122 | جدول | باقات الشركات | public/assets/js/app/components/company-b2b-settings.js:318 |
| SET-123 | جدول | باقات الشركات | public/assets/js/app/components/company-b2b-settings.js:319 |
| SET-124 | حالة فارغة | لا باقات بعد. أنشئوا باقة قبل إضافة أول شركة، أو استخدموا شروطًا مخصص… | public/assets/js/app/components/company-b2b-settings.js:321 |
| SET-125 | عنوان | الشروط | public/assets/js/app/components/company-b2b-settings.js:349 |
| SET-126 | عنصر قائمة | إلغاء | public/assets/js/app/components/company-b2b-settings.js:351 |
| SET-127 | تنبيه | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:369 |
| SET-128 | عنصر قائمة | إنشاء الباقة | public/assets/js/app/components/company-b2b-settings.js:373 |
| SET-129 | نافذة | باقة جديدة | public/assets/js/app/components/company-b2b-settings.js:381 |
| SET-130 | حقل | … : الرد الأول بالساعات | public/assets/js/app/components/company-plan-terms.js:154 |
| SET-131 | حقل | … : التسليم بالساعات | public/assets/js/app/components/company-plan-terms.js:155 |
| SET-132 | حقل | … : الساعة | public/assets/js/app/components/company-plan-terms.js:156 |
| SET-133 | حقل | رابط الدعوة | public/assets/js/app/components/account-admin.js:64 |
| SET-134 | زر | نسخ الرابط | public/assets/js/app/components/account-admin.js:76 |
| SET-135 | زر | إرسال عبر واتساب | public/assets/js/app/components/account-admin.js:79 |
| SET-136 | زر | نسخ نص الرسالة | public/assets/js/app/components/account-admin.js:80 |
| SET-137 | سؤال قابل للفتح | معاينة نص الرسالة | public/assets/js/app/components/account-admin.js:83 |
| SET-138 | عنوان | معاينة نص الرسالة | public/assets/js/app/components/account-admin.js:83 |
| SET-139 | تنبيه | لا يُعرض الرابط مرة أخرى بعد إغلاق هذه النافذة. يمكنك إصدار رابط جديد… | public/assets/js/app/components/account-admin.js:84 |
| SET-140 | عنصر قائمة | تم | public/assets/js/app/components/account-admin.js:86 |
| SET-141 | نافذة | رابط دعوة … | public/assets/js/app/components/account-admin.js:88 |
| SET-142 | عنصر قائمة | كلمة المرور المؤقتة | public/assets/js/app/components/account-admin.js:99 |
| SET-143 | عنصر قائمة | تأكيد كلمة المرور | public/assets/js/app/components/account-admin.js:100 |
| SET-144 | نافذة | كلمة مرور مؤقتة لحساب | public/assets/js/app/components/account-admin.js:109 |
| SET-145 | زر | إعادة إصدار الدعوة | public/assets/js/app/components/account-admin.js:134 |
| SET-146 | نافذة | إلغاء الدعوة | public/assets/js/app/components/account-admin.js:139 |
| SET-147 | زر | إلغاء الدعوة | public/assets/js/app/components/account-admin.js:144 |
| SET-148 | نافذة | إصدار رابط إعادة تعيين | public/assets/js/app/components/account-admin.js:155 |
| SET-149 | زر | رابط إعادة تعيين كلمة المرور | public/assets/js/app/components/account-admin.js:160 |
| SET-150 | زر | إلغاء رابط إعادة التعيين | public/assets/js/app/components/account-admin.js:168 |
| SET-151 | زر | كلمة مرور مؤقتة | public/assets/js/app/components/account-admin.js:171 |
| SET-152 | زر | رفع الإيقاف المؤقت | public/assets/js/app/components/account-admin.js:178 |
| SET-153 | نافذة | إلغاء التحقق بخطوتين | public/assets/js/app/components/account-admin.js:188 |
| SET-154 | زر | إلغاء التحقق بخطوتين | public/assets/js/app/components/account-admin.js:194 |
| SET-155 | نافذة | إنهاء الجلسات | public/assets/js/app/components/account-admin.js:201 |
| SET-156 | زر | إنهاء كل الجلسات | public/assets/js/app/components/account-admin.js:206 |
| SET-157 | نافذة | إلغاء رابط اشتراك التقويم | public/assets/js/app/components/account-admin.js:216 |
| SET-158 | زر | إلغاء رابط التقويم | public/assets/js/app/components/account-admin.js:222 |
| SET-159 | تنبيه | محاولات دخول موقوفة مؤقتًا | public/assets/js/app/components/account-admin.js:245 |
| SET-160 | تنبيه | بانتظار قبول الدعوة | public/assets/js/app/components/account-admin.js:253 |
| SET-161 | تنبيه | عُيّنت لهذا الحساب كلمة مرور مؤقتة، وسيُطلب منه تغييرها فور الدخول. | public/assets/js/app/components/account-admin.js:255 |
| SET-162 | سؤال قابل للفتح | آخر أحداث الأمان (… ) | public/assets/js/app/components/account-admin.js:279 |
| SET-163 | عنوان | آخر أحداث الأمان (… ) | public/assets/js/app/components/account-admin.js:279 |
| SET-164 | رابط | عرض كل أحداث هذا الحساب في سجل الأمان | public/assets/js/app/components/account-admin.js:290 |
| SET-165 | عنوان | الحساب والأمان | public/assets/js/app/components/account-admin.js:308 |
| SET-166 | قسم/بطاقة | الحساب والأمان | public/assets/js/app/components/account-admin.js:308 |
| SET-167 | عنصر قائمة | إغلاق | public/assets/js/app/components/account-admin.js:323 |
| SET-168 | نافذة | أمان حساب … | public/assets/js/app/components/account-admin.js:323 |
| SET-169 | عنصر قائمة | الدور | public/assets/js/app/components/account-admin.js:336 |
| SET-170 | عنصر قائمة | الاسم | public/assets/js/app/components/account-admin.js:337 |
| SET-171 | عنصر قائمة | اسم المستخدم | public/assets/js/app/components/account-admin.js:338 |
| SET-172 | عنصر قائمة | رقم الموبايل | public/assets/js/app/components/account-admin.js:339 |
| SET-173 | عنصر قائمة | البريد الإلكتروني | public/assets/js/app/components/account-admin.js:340 |
| SET-174 | عنصر قائمة | طريقة تفعيل الحساب | public/assets/js/app/components/account-admin.js:355 |
| SET-175 | عنصر قائمة | كلمة المرور المؤقتة | public/assets/js/app/components/account-admin.js:357 |
| SET-176 | نافذة | إضافة مستخدم للإدارة | public/assets/js/app/components/account-admin.js:376 |
| SET-177 | عنصر قائمة | الاسم | public/assets/js/app/components/account-admin.js:392 |
| SET-178 | عنصر قائمة | الدور | public/assets/js/app/components/account-admin.js:404 |
| SET-179 | عنصر قائمة | البريد الإلكتروني | public/assets/js/app/components/account-admin.js:406 |
| SET-180 | عنصر قائمة | رقم الموبايل | public/assets/js/app/components/account-admin.js:407 |
| SET-181 | عنصر قائمة | active | public/assets/js/app/components/account-admin.js:414 |
| SET-182 | نافذة | منح صلاحية «إدارة النظام» | public/assets/js/app/components/account-admin.js:423 |
| SET-183 | نافذة | تعديل حساب | public/assets/js/app/components/account-admin.js:432 |
| SET-184 | حالة فارغة | لا توجد دعوات معلقة؛ كل الحسابات المدعوة فُعّلت. | public/assets/js/app/components/account-admin.js:447 |
| SET-185 | رابط | (نص متغير) | public/assets/js/app/components/account-admin.js:461 |
| SET-186 | عنصر قائمة | المستخدم | public/assets/js/app/components/account-admin.js:462 |
| SET-187 | عنصر قائمة | الدور | public/assets/js/app/components/account-admin.js:464 |
| SET-188 | عنصر قائمة | الدعوة | public/assets/js/app/components/account-admin.js:465 |
| SET-189 | عنصر قائمة | أصدرها | public/assets/js/app/components/account-admin.js:466 |
| SET-190 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/account-admin.js:471 |
| SET-191 | جدول | الدعوات المعلقة | public/assets/js/app/components/account-admin.js:474 |
| SET-192 | جدول | الدعوات المعلقة | public/assets/js/app/components/account-admin.js:475 |
| SET-193 | عنوان | الدعوات المعلقة | public/assets/js/app/components/account-admin.js:483 |
| SET-194 | قسم/بطاقة | الدعوات المعلقة | public/assets/js/app/components/account-admin.js:483 |
| SET-195 | رابط | صفحة حسابي والأمان | public/assets/js/app/components/account-admin.js:554 |
| SET-196 | تنبيه | لتفعيل إلزام مديري النظام بالتحقق بخطوتين فعّله لحسابك أولًا من | public/assets/js/app/components/account-admin.js:554 |
| SET-197 | عنوان | سياسة الأمان | public/assets/js/app/components/account-admin.js:562 |
| SET-198 | قسم/بطاقة | سياسة الأمان | public/assets/js/app/components/account-admin.js:562 |
| SET-199 | عنصر قائمة | الاسم | public/assets/js/app/components/account-admin.js:597 |
| SET-200 | عنصر قائمة | الدور | public/assets/js/app/components/account-admin.js:599 |
| SET-201 | عنصر قائمة | الحالة | public/assets/js/app/components/account-admin.js:600 |
| SET-202 | عنصر قائمة | التحقق بخطوتين | public/assets/js/app/components/account-admin.js:605 |
| SET-203 | عنصر قائمة | التواصل | public/assets/js/app/components/account-admin.js:611 |
| SET-204 | عنصر قائمة | آخر دخول | public/assets/js/app/components/account-admin.js:617 |
| SET-205 | زر | تعديل | public/assets/js/app/components/account-admin.js:625 |
| SET-206 | زر | الأمان | public/assets/js/app/components/account-admin.js:626 |
| SET-207 | عنصر قائمة | تعديل | public/assets/js/app/components/account-admin.js:628 |
| SET-208 | جدول | مستخدمو الإدارة | public/assets/js/app/components/account-admin.js:631 |
| SET-209 | جدول | مستخدمو الإدارة | public/assets/js/app/components/account-admin.js:632 |
| SET-210 | زر | إضافة مستخدم | public/assets/js/app/components/account-admin.js:645 |
| SET-211 | رابط | شبكة المحامين | public/assets/js/app/components/account-admin.js:650 |
| SET-212 | رابط | سجل الأمان | public/assets/js/app/components/account-admin.js:650 |
| SET-213 | عنوان | المستخدمون | public/assets/js/app/components/account-admin.js:652 |
| SET-214 | قسم/بطاقة | المستخدمون | public/assets/js/app/components/account-admin.js:653 |
| SET-215 | نافذة | تأكيد | public/assets/js/app/components/media-settings.js:119 |
| SET-216 | عنوان | المستندات والصوت | public/assets/js/app/components/media-settings.js:176 |
| SET-217 | قسم/بطاقة | الرسائل الصوتية، وتحسين صور المستندات، وقراءة نصها. النص الآلي مسودة… | public/assets/js/app/components/media-settings.js:177 |
| SET-218 | عنصر قائمة | اسم المؤسسة | public/assets/js/app/pages/admin/settings.js:92 |
| SET-219 | عنصر قائمة | الشعار التعريفي | public/assets/js/app/pages/admin/settings.js:93 |
| SET-220 | عنصر قائمة | نص الخصوصية الظاهر للمستفيدين | public/assets/js/app/pages/admin/settings.js:103 |
| SET-221 | عنصر قائمة | رقم واتساب الظاهر للمستفيدين | public/assets/js/app/pages/admin/settings.js:116 |
| SET-222 | عنصر قائمة | قالب احتياطي (للتوافق) | public/assets/js/app/pages/admin/settings.js:128 |
| SET-223 | عنصر قائمة | لغة القالب الاحتياطي | public/assets/js/app/pages/admin/settings.js:130 |
| SET-224 | عنصر قائمة | المدة الافتراضية لرد المحامي | public/assets/js/app/pages/admin/settings.js:141 |
| SET-225 | عنصر قائمة | موعد صرف مستحقات المحامين | public/assets/js/app/pages/admin/settings.js:150 |
| SET-226 | عنصر قائمة | تعليمات الدفع للمستفيد/ة | public/assets/js/app/pages/admin/settings.js:162 |
| SET-227 | عنصر قائمة | حد التشابه للحالات المشابهة | public/assets/js/app/pages/admin/settings.js:172 |
| SET-228 | زر | حفظ الإعدادات | public/assets/js/app/pages/admin/settings.js:206 |
| SET-229 | نموذج | اسم المؤسسة | public/assets/js/app/pages/admin/settings.js:207 |
| SET-230 | عنصر قائمة | اسم المكتب كما يراه العملاء | public/assets/js/app/components/site-settings.js:61 |
| SET-231 | عنصر قائمة | الاسم المختصر | public/assets/js/app/components/site-settings.js:63 |
| SET-232 | عنصر قائمة | إظهار اسم المكتب في منصة فريق العمل والمحامين | public/assets/js/app/components/site-settings.js:70 |
| SET-233 | عنصر قائمة | اسم البرنامج على الموقع | public/assets/js/app/components/site-settings.js:72 |
| SET-234 | عنصر قائمة | الاسم الرسمي الكامل للمؤسسة | public/assets/js/app/components/site-settings.js:73 |
| SET-235 | عنصر قائمة | بيانات الإشهار | public/assets/js/app/components/site-settings.js:74 |
| SET-236 | عنصر قائمة | عنوان المقر | public/assets/js/app/components/site-settings.js:75 |
| SET-237 | عنصر قائمة | مواعيد العمل | public/assets/js/app/components/site-settings.js:76 |
| SET-238 | عنصر قائمة | هاتف المؤسسة | public/assets/js/app/components/site-settings.js:77 |
| SET-239 | عنصر قائمة | البريد الإلكتروني | public/assets/js/app/components/site-settings.js:78 |
| SET-240 | عنصر قائمة | صفحة فيسبوك | public/assets/js/app/components/site-settings.js:79 |
| SET-241 | عنصر قائمة | حساب إنستجرام | public/assets/js/app/components/site-settings.js:80 |
| SET-242 | زر | حفظ بيانات الموقع | public/assets/js/app/components/site-settings.js:103 |
| SET-243 | نموذج | اسم المكتب كما يراه العملاء | public/assets/js/app/components/site-settings.js:104 |
| SET-249 | عنصر قائمة | partners_box | public/assets/js/app/components/site-settings.js:313 |
| SET-251 | نموذج | اسم المكتب القانوني | public/assets/js/app/components/site-settings.js:346 |
| SET-252 | عنصر قائمة | مدة السكوت قبل التلخيص (بالدقائق) | public/assets/js/app/components/story-settings.js:40 |
| SET-253 | عنصر قائمة | إرسال ترحيب بقائمة المواضيع لأول رسالة على واتساب | public/assets/js/app/components/story-settings.js:48 |
| SET-255 | عنصر قائمة | إرسال «وصلتنا حكايتك» ورقم الطلب عندما تكتمل القصة | public/assets/js/app/components/story-settings.js:58 |
| SET-256 | عنصر قائمة | الرقم الذي نتصل منه بالمستفيدات | public/assets/js/app/components/story-settings.js:67 |
| SET-257 | عنصر قائمة | نتصل خلال (أيام عمل) | public/assets/js/app/components/story-settings.js:69 |
| SET-258 | عنصر قائمة | wa_segment_choice_enabled | public/assets/js/app/components/story-settings.js:78 |
| SET-259 | عنصر قائمة | segment_returning_days | public/assets/js/app/components/story-settings.js:80 |
| SET-260 | زر | حفظ | public/assets/js/app/components/story-settings.js:116 |
| SET-261 | نموذج | مدة السكوت قبل التلخيص (بالدقائق) | public/assets/js/app/components/story-settings.js:117 |
| SET-262 | عنصر قائمة | خادم SMTP | public/assets/js/app/components/email-settings.js:125 |
| SET-263 | عنصر قائمة | المنفذ | public/assets/js/app/components/email-settings.js:126 |
| SET-264 | عنصر قائمة | التشفير | public/assets/js/app/components/email-settings.js:127 |
| SET-265 | عنصر قائمة | اسم المستخدم | public/assets/js/app/components/email-settings.js:128 |
| SET-266 | عنصر قائمة | كلمة المرور | public/assets/js/app/components/email-settings.js:136 |
| SET-267 | عنصر قائمة | عنوان المرسل | public/assets/js/app/components/email-settings.js:138 |
| SET-268 | عنصر قائمة | اسم المرسل | public/assets/js/app/components/email-settings.js:139 |
| SET-269 | نموذج | خادم SMTP | public/assets/js/app/components/email-settings.js:152 |
| SET-270 | عنصر قائمة | رابط شروط الخدمة للشركات | public/assets/js/app/components/company-b2b-settings.js:131 |
| SET-271 | نموذج | رابط شروط الخدمة للشركات | public/assets/js/app/components/company-b2b-settings.js:131 |
| SET-272 | نموذج | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:178 |
| SET-273 | نموذج | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:182 |
| SET-274 | نموذج | تذكير … قبل (أيام) | public/assets/js/app/components/company-b2b-settings.js:187 |
| SET-275 | نموذج | اسم الباقة | public/assets/js/app/components/company-b2b-settings.js:338 |
| SET-276 | عنصر قائمة | الفئة | public/assets/js/app/components/company-plan-terms.js:128 |
| SET-277 | عنصر قائمة | فترة الاشتراك | public/assets/js/app/components/company-plan-terms.js:129 |
| SET-278 | عنصر قائمة | السعر لكل فترة | public/assets/js/app/components/company-plan-terms.js:130 |
| SET-279 | عنصر قائمة | الطلبات المشمولة في الدورة | public/assets/js/app/components/company-plan-terms.js:131 |
| SET-280 | عنصر قائمة | الطلبات العاجلة في الدورة | public/assets/js/app/components/company-plan-terms.js:132 |
| SET-281 | عنصر قائمة | الكيانات | public/assets/js/app/components/company-plan-terms.js:133 |
| SET-282 | عنصر قائمة | المستخدمون | public/assets/js/app/components/company-plan-terms.js:134 |
| SET-283 | عنصر قائمة | عند تجاوز الطلبات المشمولة | public/assets/js/app/components/company-plan-terms.js:135 |
| SET-284 | عنصر قائمة | سعر الطلب الإضافي | public/assets/js/app/components/company-plan-terms.js:136 |
| SET-285 | عنصر قائمة | حد قيمة العقد | public/assets/js/app/components/company-plan-terms.js:137 |
| SET-286 | عنصر قائمة | المراجعة الثانية المستقلة | public/assets/js/app/components/company-plan-terms.js:138 |
| SET-287 | عنصر قائمة | جولات التعديل | public/assets/js/app/components/company-plan-terms.js:139 |
| SET-288 | عنصر قائمة | معامل الحجم S | public/assets/js/app/components/company-plan-terms.js:140 |
| SET-289 | عنصر قائمة | معامل الحجم M | public/assets/js/app/components/company-plan-terms.js:141 |
| SET-290 | عنصر قائمة | معامل الحجم L | public/assets/js/app/components/company-plan-terms.js:142 |
| SET-291 | عنصر قائمة | الأنواع المشمولة | public/assets/js/app/components/company-plan-terms.js:143 |
| SET-292 | عنصر قائمة | الأعمال المستبعدة | public/assets/js/app/components/company-plan-terms.js:144 |
| SET-293 | نموذج | الفئة | public/assets/js/app/components/company-plan-terms.js:146 |
| SET-294 | عنصر قائمة | إلزام كل حسابات «إدارة النظام» بالتحقق بخطوتين (من لم يفعّله يُطلب من… | public/assets/js/app/components/account-admin.js:503 |
| SET-295 | عنصر قائمة | إنهاء الجلسة بعد عدم النشاط | public/assets/js/app/components/account-admin.js:505 |
| SET-296 | عنصر قائمة | الحد الأقصى لعمر الجلسة | public/assets/js/app/components/account-admin.js:506 |
| SET-297 | عنصر قائمة | «تذكّرني على هذا الجهاز» للمحامين | public/assets/js/app/components/account-admin.js:523 |
| SET-298 | عنصر قائمة | مدة «تذكّرني» بلا تحقق بخطوتين | public/assets/js/app/components/account-admin.js:525 |
| SET-299 | عنصر قائمة | مدة «تذكّرني» مع التحقق بخطوتين | public/assets/js/app/components/account-admin.js:526 |
| SET-300 | عنصر قائمة | صلاحية رابط الدعوة | public/assets/js/app/components/account-admin.js:527 |
| SET-301 | عنصر قائمة | صلاحية رابط إعادة التعيين | public/assets/js/app/components/account-admin.js:528 |
| SET-302 | عنصر قائمة | مدة الاحتفاظ بأحداث سجل الأمان | public/assets/js/app/components/account-admin.js:529 |
| SET-303 | زر | حفظ سياسة الأمان | public/assets/js/app/components/account-admin.js:548 |
| SET-304 | نموذج | إلزام كل حسابات «إدارة النظام» بالتحقق بخطوتين (من لم يفعّله يُطلب من… | public/assets/js/app/components/account-admin.js:549 |
| SET-305 | عنصر قائمة | web_voice_enabled | public/assets/js/app/components/media-settings.js:85 |
| SET-306 | عنصر قائمة | stt_auto | public/assets/js/app/components/media-settings.js:86 |
| SET-307 | عنصر قائمة | stt_charity_third_party | public/assets/js/app/components/media-settings.js:87 |
| SET-308 | عنصر قائمة | stt_minutes_per_client_day | public/assets/js/app/components/media-settings.js:88 |
| SET-309 | عنصر قائمة | scan_client_enabled | public/assets/js/app/components/media-settings.js:89 |
| SET-310 | عنصر قائمة | scan_server_auto | public/assets/js/app/components/media-settings.js:90 |
| SET-311 | عنصر قائمة | ocr_provider | public/assets/js/app/components/media-settings.js:91 |
| SET-312 | عنصر قائمة | ocr_claude_allowed | public/assets/js/app/components/media-settings.js:92 |
| SET-313 | عنصر قائمة | ocr_claude_companies | public/assets/js/app/components/media-settings.js:93 |
| SET-314 | عنصر قائمة | ocr_claude_budget_pct | public/assets/js/app/components/media-settings.js:94 |
| SET-315 | عنصر قائمة | ocr_model | public/assets/js/app/components/media-settings.js:95 |
| SET-316 | عنصر قائمة | ocr_max_pages | public/assets/js/app/components/media-settings.js:96 |
| SET-317 | زر | حفظ | public/assets/js/app/components/media-settings.js:136 |
| SET-318 | نموذج | حفظ | public/assets/js/app/components/media-settings.js:137 |
| SET-319 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:29 |
| SET-320 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:30 |
| SET-321 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:31 |
| SET-322 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:32 |
| SET-323 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:33 |
| SET-324 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:34 |
| SET-325 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:35 |
| SET-326 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:38 |
| SET-327 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:39 |
| SET-328 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:40 |
| SET-329 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:41 |
| SET-330 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:42 |
| SET-331 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:43 |
| SET-332 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:44 |
| SET-333 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:45 |
| SET-334 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:46 |
| SET-335 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:49 |
| SET-336 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:50 |
| SET-337 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:51 |
| SET-338 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:52 |
| SET-339 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:53 |
| SET-340 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-b2b-settings.js:54 |
| SET-341 | عنصر قائمة | اسم الباقة | public/assets/js/app/components/company-b2b-settings.js:333 |
| SET-342 | عنصر قائمة | المفتاح | public/assets/js/app/components/company-b2b-settings.js:334 |
| SET-343 | عنصر قائمة | الوصف | public/assets/js/app/components/company-b2b-settings.js:335 |
| SET-344 | عنصر قائمة | متاحة للاشتراكات الجديدة | public/assets/js/app/components/company-b2b-settings.js:336 |
| SET-345 | رسالة | color | public/assets/js/app/components/brand-settings.js:165 |
| SET-346 | رسالة | hex | public/assets/js/app/components/brand-settings.js:165 |
| SET-347 | عنصر | (نص متغير) | public/assets/js/app/components/site-settings.js:351 |

## INT: التكاملات (`/app#/integrations`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| INT-01 | قسم/بطاقة | توجيه النموذج: … | public/assets/js/app/pages/admin/integrations.js:562 |
| INT-02 | قسم/بطاقة | مضبوط | public/assets/js/app/pages/admin/integrations.js:548 |
| INT-03 | زر | تعديل | public/assets/js/app/pages/admin/integrations.js:544 |
| INT-04 | زر | اختبار الاتصال | public/assets/js/app/pages/admin/integrations.js:533 |
| INT-05 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/integrations.js:531 |
| INT-06 | حقل | نوع الخدمة | public/assets/js/app/pages/admin/integrations.js:483 |
| INT-07 | حقل | مزوّد التحويل | public/assets/js/app/pages/admin/integrations.js:483 |
| INT-08 | حقل | عنوان الخدمة | public/assets/js/app/pages/admin/integrations.js:483 |
| INT-09 | حقل | المفتاح | public/assets/js/app/pages/admin/integrations.js:483 |
| INT-10 | حقل | النموذج | public/assets/js/app/pages/admin/integrations.js:483 |
| INT-11 | حقل | اللغة | public/assets/js/app/pages/admin/integrations.js:483 |
| INT-12 | حقل | توجيه النموذج | public/assets/js/app/pages/admin/integrations.js:483 |
| INT-13 | حقل | مكان التشغيل | public/assets/js/app/pages/admin/integrations.js:483 |
| INT-14 | حقل | السعر لكل دقيقة (دولار) | public/assets/js/app/pages/admin/integrations.js:483 |
| INT-15 | حقل | حد الإنفاق الشهري (دولار) | public/assets/js/app/pages/admin/integrations.js:483 |
| INT-16 | حقل | اسم المزوّد | public/assets/js/app/pages/admin/integrations.js:483 |
| INT-17 | حقل | شروط المزوّد تمنع استخدام التسجيلات في التدريب، ومدة الاحتفاظ بها لا… | public/assets/js/app/pages/admin/integrations.js:483 |
| INT-18 | نافذة | تأكيد التغيير | public/assets/js/app/pages/admin/integrations.js:44 |
| INT-19 | تنبيه | نجح الاتصال | public/assets/js/app/pages/admin/integrations.js:127 |
| INT-20 | تنبيه | مفتاح التشفير مؤقت | public/assets/js/app/pages/admin/integrations.js:136 |
| INT-21 | تنبيه | انسخ مفتاح التشفير احتياطيًا | public/assets/js/app/pages/admin/integrations.js:148 |
| INT-22 | تنبيه | مفتاح التشفير | public/assets/js/app/pages/admin/integrations.js:151 |
| INT-23 | زر | توليد رمز عشوائي | public/assets/js/app/pages/admin/integrations.js:272 |
| INT-24 | نافذة | تعديل إعدادات | public/assets/js/app/pages/admin/integrations.js:290 |
| INT-25 | تنبيه | (نص متغير) | public/assets/js/app/pages/admin/integrations.js:309 |
| INT-26 | تنبيه | (نص متغير) | public/assets/js/app/pages/admin/integrations.js:310 |
| INT-27 | حقل | (نص متغير) | public/assets/js/app/pages/admin/integrations.js:312 |
| INT-28 | قسم/بطاقة | رقم الأفراد والشركات | public/assets/js/app/pages/admin/integrations.js:328 |
| INT-29 | عنوان | رقم الأفراد والشركات | public/assets/js/app/pages/admin/integrations.js:329 |
| INT-30 | تنبيه | اختبار الاتصال غير متاح | public/assets/js/app/pages/admin/integrations.js:347 |
| INT-31 | زر | اختبار الاتصال | public/assets/js/app/pages/admin/integrations.js:353 |
| INT-32 | زر | تعديل | public/assets/js/app/pages/admin/integrations.js:355 |
| INT-33 | تنبيه | تعذر فك تشفير القيم المحفوظة | public/assets/js/app/pages/admin/integrations.js:366 |
| INT-34 | تنبيه | سر التطبيق غير مضبوط | public/assets/js/app/pages/admin/integrations.js:370 |
| INT-35 | زر | نسخ | public/assets/js/app/pages/admin/integrations.js:376 |
| INT-36 | عنوان | نتيجة اختبار الاتصال | public/assets/js/app/pages/admin/integrations.js:397 |
| INT-37 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/integrations.js:398 |
| INT-38 | قسم/بطاقة | نتيجة اختبار الاتصال | public/assets/js/app/pages/admin/integrations.js:399 |
| INT-39 | تنبيه | آخر اختبار: ناجح | public/assets/js/app/pages/admin/integrations.js:444 |
| INT-40 | نافذة | تعديل | public/assets/js/app/pages/admin/integrations.js:520 |
| INT-41 | تنبيه | تعذر فك تشفير القيم المحفوظة | public/assets/js/app/pages/admin/integrations.js:558 |
| INT-42 | تنبيه | (نص متغير) | public/assets/js/app/pages/admin/integrations.js:559 |
| INT-43 | عنوان | نتيجة اختبار الاتصال | public/assets/js/app/pages/admin/integrations.js:575 |
| INT-44 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/integrations.js:577 |
| INT-45 | سؤال قابل للفتح | (نص متغير) | public/assets/js/app/pages/admin/integrations.js:585 |
| INT-46 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/integrations.js:585 |
| INT-47 | عنوان | دليل الربط خطوة بخطوة | public/assets/js/app/pages/admin/integrations.js:625 |
| INT-48 | قسم/بطاقة | دليل الربط خطوة بخطوة | public/assets/js/app/pages/admin/integrations.js:626 |
| INT-49 | عنوان | التكاملات | public/assets/js/app/pages/admin/integrations.js:645 |
| INT-50 | عنوان | التكاملات | public/assets/js/app/pages/admin/integrations.js:645 |
| INT-51 | زر | تحديث | public/assets/js/app/pages/admin/integrations.js:653 |
| INT-52 | عنوان | التكاملات | public/assets/js/app/pages/admin/integrations.js:654 |
| INT-53 | عنوان | التكاملات | public/assets/js/app/pages/admin/integrations.js:655 |
| INT-54 | رابط | سجل الأمان | public/assets/js/app/pages/admin/integrations.js:666 |
| INT-55 | عنصر قائمة | نوع الخدمة | public/assets/js/app/pages/admin/integrations.js:469 |
| INT-56 | عنصر قائمة | مزوّد التحويل | public/assets/js/app/pages/admin/integrations.js:470 |
| INT-57 | عنصر قائمة | مكان التشغيل | public/assets/js/app/pages/admin/integrations.js:471 |
| INT-58 | عنصر قائمة | عنوان الخدمة | public/assets/js/app/pages/admin/integrations.js:472 |
| INT-59 | عنصر قائمة | المفتاح | public/assets/js/app/pages/admin/integrations.js:473 |
| INT-60 | عنصر قائمة | اسم المزوّد | public/assets/js/app/pages/admin/integrations.js:474 |
| INT-61 | عنصر قائمة | النموذج | public/assets/js/app/pages/admin/integrations.js:475 |
| INT-62 | عنصر قائمة | اللغة | public/assets/js/app/pages/admin/integrations.js:476 |
| INT-63 | عنصر قائمة | شروط المزوّد تمنع استخدام التسجيلات في التدريب، ومدة الاحتفاظ بها لا… | public/assets/js/app/pages/admin/integrations.js:477 |
| INT-64 | عنصر قائمة | توجيه النموذج | public/assets/js/app/pages/admin/integrations.js:478 |
| INT-65 | عنصر قائمة | السعر لكل دقيقة (دولار) | public/assets/js/app/pages/admin/integrations.js:479 |
| INT-66 | عنصر قائمة | حد الإنفاق الشهري (دولار) | public/assets/js/app/pages/admin/integrations.js:480 |
| INT-67 | عنصر قائمة | أقصى مدة للرسالة (ثانية) | public/assets/js/app/pages/admin/integrations.js:481 |
| INT-68 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:159 |
| INT-69 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:160 |
| INT-70 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:161 |
| INT-71 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:162 |
| INT-72 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:163 |
| INT-73 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:164 |
| INT-74 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:165 |
| INT-75 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:166 |
| INT-76 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:167 |
| INT-77 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:168 |
| INT-78 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:169 |
| INT-79 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:172 |
| INT-80 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:173 |
| INT-81 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:174 |
| INT-82 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:175 |
| INT-83 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:176 |
| INT-84 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:177 |
| INT-85 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:180 |
| INT-86 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:181 |
| INT-87 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:182 |
| INT-88 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:183 |
| INT-89 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:184 |
| INT-90 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:185 |
| INT-91 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:186 |
| INT-92 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:187 |
| INT-93 | رسالة | tag | public/assets/js/app/pages/admin/integrations.js:188 |

## SYS: صحة النظام والنسخ الاحتياطي (`/app#/system`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| SYS-01 | قائمة | (نص متغير) | public/assets/js/app/pages/admin/system.js:352 |
| SYS-02 | نص | افحص الأدوات | public/assets/js/app/pages/admin/system.js:368 |
| SYS-03 | قسم/بطاقة | لا شيء في الطابور الآن. | public/assets/js/app/pages/admin/system.js:358 |
| SYS-04 | قائمة | … · مستند … : | public/assets/js/app/pages/admin/system.js:363 |
| SYS-05 | نص | شغّل الآن | public/assets/js/app/pages/admin/system.js:373 |
| SYS-06 | زر | حوّل الرسائل الصوتية المعلقة (آخر 30 يومًا) | public/assets/js/app/pages/admin/system.js:384 |
| SYS-07 | زر | نظّف واقرأ المستندات القديمة | public/assets/js/app/pages/admin/system.js:385 |
| SYS-08 | نص | الذاكرة المتاحة الآن: … من … . البحث في النص: … . | public/assets/js/app/pages/admin/system.js:355 |
| SYS-09 | عنصر قائمة | (نص متغير) | public/assets/js/app/pages/admin/system.js:127 |
| SYS-10 | عنصر قائمة | (نص متغير) | public/assets/js/app/pages/admin/system.js:127 |
| SYS-11 | زر | فتح | public/assets/js/app/pages/admin/system.js:136 |
| SYS-12 | عنوان | جاهزية الإطلاق | public/assets/js/app/pages/admin/system.js:140 |
| SYS-13 | قسم/بطاقة | جاهزية الإطلاق | public/assets/js/app/pages/admin/system.js:141 |
| SYS-14 | بطاقة رقم | الإصدار | public/assets/js/app/pages/admin/system.js:149 |
| SYS-15 | بطاقة رقم | مدة التشغيل | public/assets/js/app/pages/admin/system.js:150 |
| SYS-16 | بطاقة رقم | قاعدة البيانات | public/assets/js/app/pages/admin/system.js:151 |
| SYS-17 | بطاقة رقم | المرفقات | public/assets/js/app/pages/admin/system.js:152 |
| SYS-18 | بطاقة رقم | المساحة الحرة على القرص | public/assets/js/app/pages/admin/system.js:159 |
| SYS-19 | بطاقة رقم | آخر نسخة احتياطية | public/assets/js/app/pages/admin/system.js:168 |
| SYS-20 | بطاقة رقم | رسائل صادرة فاشلة | public/assets/js/app/pages/admin/system.js:177 |
| SYS-21 | عنوان | الخادم | public/assets/js/app/pages/admin/system.js:197 |
| SYS-22 | قسم/بطاقة | الخادم | public/assets/js/app/pages/admin/system.js:198 |
| SYS-23 | عنصر قائمة | الجدول | public/assets/js/app/pages/admin/system.js:218 |
| SYS-24 | عنصر قائمة | عدد السجلات | public/assets/js/app/pages/admin/system.js:219 |
| SYS-25 | جدول | عدد السجلات في الجداول الرئيسية | public/assets/js/app/pages/admin/system.js:222 |
| SYS-26 | جدول | عدد السجلات في الجداول الرئيسية | public/assets/js/app/pages/admin/system.js:223 |
| SYS-27 | عنوان | قاعدة البيانات والسجلات | public/assets/js/app/pages/admin/system.js:226 |
| SYS-28 | قسم/بطاقة | قاعدة البيانات والسجلات | public/assets/js/app/pages/admin/system.js:227 |
| SYS-29 | عنصر قائمة | المهمة | public/assets/js/app/pages/admin/system.js:242 |
| SYS-30 | عنصر قائمة | التكرار | public/assets/js/app/pages/admin/system.js:243 |
| SYS-31 | عنصر قائمة | آخر تشغيل | public/assets/js/app/pages/admin/system.js:244 |
| SYS-32 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/system.js:249 |
| SYS-33 | عنصر قائمة | مرات التشغيل | public/assets/js/app/pages/admin/system.js:251 |
| SYS-34 | زر | تشغيل الآن | public/assets/js/app/pages/admin/system.js:265 |
| SYS-35 | عنصر قائمة | إجراء | public/assets/js/app/pages/admin/system.js:267 |
| SYS-36 | جدول | المهام الدورية | public/assets/js/app/pages/admin/system.js:271 |
| SYS-37 | جدول | المهام الدورية | public/assets/js/app/pages/admin/system.js:272 |
| SYS-38 | عنوان | المهام الدورية | public/assets/js/app/pages/admin/system.js:274 |
| SYS-39 | قسم/بطاقة | المهام الدورية | public/assets/js/app/pages/admin/system.js:275 |
| SYS-40 | عنوان | المستندات والصوت | public/assets/js/app/pages/admin/system.js:312 |
| SYS-41 | قسم/بطاقة | المستندات والصوت | public/assets/js/app/pages/admin/system.js:312 |
| SYS-42 | تنبيه | تعذر تحميل حالة المعالجة | public/assets/js/app/pages/admin/system.js:319 |
| SYS-43 | زر | أُضيف … إلى الطابور | public/assets/js/app/pages/admin/system.js:345 |
| SYS-44 | زر | افحص الأدوات | public/assets/js/app/pages/admin/system.js:369 |
| SYS-45 | زر | شغّل الآن | public/assets/js/app/pages/admin/system.js:381 |
| SYS-46 | زر | فتح صندوق الصادر | public/assets/js/app/pages/admin/system.js:408 |
| SYS-47 | عنوان | صندوق الصادر | public/assets/js/app/pages/admin/system.js:410 |
| SYS-48 | قسم/بطاقة | صندوق الصادر | public/assets/js/app/pages/admin/system.js:411 |
| SYS-49 | زر | إدارة التكاملات | public/assets/js/app/pages/admin/system.js:432 |
| SYS-50 | عنوان | التكاملات | public/assets/js/app/pages/admin/system.js:434 |
| SYS-51 | قسم/بطاقة | التكاملات | public/assets/js/app/pages/admin/system.js:435 |
| SYS-52 | عنصر قائمة | النسخ الاحتياطي اليومي التلقائي | public/assets/js/app/pages/admin/system.js:445 |
| SYS-53 | عنصر قائمة | عدد النسخ المحتفظ بها | public/assets/js/app/pages/admin/system.js:446 |
| SYS-54 | نافذة | إعدادات النسخ الاحتياطي | public/assets/js/app/pages/admin/system.js:450 |
| SYS-55 | زر | تنزيل | public/assets/js/app/pages/admin/system.js:466 |
| SYS-56 | نافذة | حذف نسخة احتياطية | public/assets/js/app/pages/admin/system.js:475 |
| SYS-57 | زر | حذف | public/assets/js/app/pages/admin/system.js:485 |
| SYS-58 | تنبيه | النسخ الاحتياطي متأخر | public/assets/js/app/pages/admin/system.js:489 |
| SYS-59 | تنبيه | لا توجد نسخ احتياطية | public/assets/js/app/pages/admin/system.js:491 |
| SYS-60 | زر | الإعدادات | public/assets/js/app/pages/admin/system.js:502 |
| SYS-61 | زر | نسخ احتياطي الآن | public/assets/js/app/pages/admin/system.js:511 |
| SYS-62 | تنبيه | قاعدة البيانات تعمل في الذاكرة؛ النسخ الاحتياطي غير متاح. | public/assets/js/app/pages/admin/system.js:518 |
| SYS-63 | تنبيه | النسخ الاحتياطي اليومي التلقائي متوقف. فعّله من «الإعدادات». | public/assets/js/app/pages/admin/system.js:519 |
| SYS-64 | عنصر قائمة | الملف | public/assets/js/app/pages/admin/system.js:526 |
| SYS-65 | عنصر قائمة | التاريخ | public/assets/js/app/pages/admin/system.js:527 |
| SYS-66 | عنصر قائمة | النوع | public/assets/js/app/pages/admin/system.js:528 |
| SYS-67 | عنصر قائمة | الحجم | public/assets/js/app/pages/admin/system.js:529 |
| SYS-68 | عنصر قائمة | فحص السلامة | public/assets/js/app/pages/admin/system.js:530 |
| SYS-69 | عنصر قائمة | إجراءات | public/assets/js/app/pages/admin/system.js:531 |
| SYS-70 | جدول | النسخ الاحتياطية المتاحة على الخادم | public/assets/js/app/pages/admin/system.js:534 |
| SYS-71 | جدول | النسخ الاحتياطية المتاحة على الخادم | public/assets/js/app/pages/admin/system.js:535 |
| SYS-72 | حالة فارغة | لا توجد نسخ احتياطية محفوظة على الخادم بعد. | public/assets/js/app/pages/admin/system.js:537 |
| SYS-73 | عنوان | النسخ الاحتياطي | public/assets/js/app/pages/admin/system.js:540 |
| SYS-74 | قسم/بطاقة | النسخ الاحتياطي | public/assets/js/app/pages/admin/system.js:541 |
| SYS-75 | حقل | (نص متغير) | public/assets/js/app/pages/admin/system.js:551 |
| SYS-76 | نافذة | تصدير كامل للمنصة | public/assets/js/app/pages/admin/system.js:565 |
| SYS-77 | تنبيه | مفتاح التشفير مضبوط من APP_SECRET: اضبط نفس القيمة على الخادم الجديد… | public/assets/js/app/pages/admin/system.js:591 |
| SYS-78 | زر | تنزيل التصدير الكامل | public/assets/js/app/pages/admin/system.js:594 |
| SYS-79 | عنوان | التصدير الكامل ونقل الخادم | public/assets/js/app/pages/admin/system.js:596 |
| SYS-80 | قسم/بطاقة | التصدير الكامل ونقل الخادم | public/assets/js/app/pages/admin/system.js:597 |
| SYS-81 | عنوان | صحة النظام والنسخ الاحتياطي | public/assets/js/app/pages/admin/system.js:611 |
| SYS-82 | عنوان | صحة النظام والنسخ الاحتياطي | public/assets/js/app/pages/admin/system.js:611 |
| SYS-83 | زر | تحديث | public/assets/js/app/pages/admin/system.js:620 |
| SYS-84 | عنوان | صحة النظام والنسخ الاحتياطي | public/assets/js/app/pages/admin/system.js:621 |
| SYS-85 | عنوان | صحة النظام والنسخ الاحتياطي | public/assets/js/app/pages/admin/system.js:622 |

## AUD: سجل الأمان (`/app#/audit`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| AUD-01 | عنصر قائمة | إغلاق | public/assets/js/app/pages/admin/audit.js:171 |
| AUD-02 | نافذة | الوقت | public/assets/js/app/pages/admin/audit.js:172 |
| AUD-03 | بطاقة رقم | دخول ناجح (24 ساعة) | public/assets/js/app/pages/admin/audit.js:209 |
| AUD-04 | بطاقة رقم | محاولات فاشلة (24 ساعة) | public/assets/js/app/pages/admin/audit.js:210 |
| AUD-05 | بطاقة رقم | إيقاف مؤقت (7 أيام) | public/assets/js/app/pages/admin/audit.js:211 |
| AUD-06 | بطاقة رقم | أحداث حرجة (7 أيام) | public/assets/js/app/pages/admin/audit.js:212 |
| AUD-07 | بطاقة رقم | جلسات نشطة الآن | public/assets/js/app/pages/admin/audit.js:213 |
| AUD-08 | بطاقة رقم | مديرو نظام بدون تحقق بخطوتين | public/assets/js/app/pages/admin/audit.js:214 |
| AUD-09 | حقل | بحث في سجل الأمان | public/assets/js/app/pages/admin/audit.js:222 |
| AUD-10 | حقل | نوع الحدث | public/assets/js/app/pages/admin/audit.js:223 |
| AUD-11 | حقل | درجة الخطورة | public/assets/js/app/pages/admin/audit.js:224 |
| AUD-12 | حقل | المستخدم | public/assets/js/app/pages/admin/audit.js:225 |
| AUD-13 | حقل | (نص متغير) | public/assets/js/app/pages/admin/audit.js:227 |
| AUD-14 | زر | مسح الفلاتر | public/assets/js/app/pages/admin/audit.js:230 |
| AUD-15 | زر | تصدير CSV | public/assets/js/app/pages/admin/audit.js:238 |
| AUD-16 | زر | مسح الفلاتر | public/assets/js/app/pages/admin/audit.js:273 |
| AUD-17 | حالة فارغة | لا توجد أحداث تطابق الفلاتر المحددة | public/assets/js/app/pages/admin/audit.js:273 |
| AUD-18 | عنصر قائمة | الوقت | public/assets/js/app/pages/admin/audit.js:285 |
| AUD-19 | عنصر قائمة | الخطورة | public/assets/js/app/pages/admin/audit.js:286 |
| AUD-20 | عنصر قائمة | الحدث | public/assets/js/app/pages/admin/audit.js:287 |
| AUD-21 | عنصر قائمة | المستخدم | public/assets/js/app/pages/admin/audit.js:288 |
| AUD-22 | عنصر قائمة | الوصف | public/assets/js/app/pages/admin/audit.js:289 |
| AUD-23 | عنصر قائمة | العنوان والجهاز | public/assets/js/app/pages/admin/audit.js:290 |
| AUD-24 | جدول | أحداث سجل الأمان | public/assets/js/app/pages/admin/audit.js:292 |
| AUD-25 | جدول | أحداث سجل الأمان | public/assets/js/app/pages/admin/audit.js:293 |
| AUD-26 | قائمة روابط | صفحات النتائج | public/assets/js/app/pages/admin/audit.js:298 |
| AUD-27 | زر | السابق | public/assets/js/app/pages/admin/audit.js:299 |
| AUD-28 | زر | التالي | public/assets/js/app/pages/admin/audit.js:301 |
| AUD-29 | عنصر قائمة | لوحة المتابعة | public/assets/js/app/pages/admin/audit.js:316 |
| AUD-30 | عنوان | سجل الأمان | public/assets/js/app/pages/admin/audit.js:318 |
| AUD-31 | عنوان | سجل الأمان | public/assets/js/app/pages/admin/audit.js:319 |
| AUD-32 | قسم/بطاقة | من | public/assets/js/app/pages/admin/audit.js:329 |

## DAT: استيراد وتصدير البيانات (`/app#/data`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| DAT-01 | رابط | (نص متغير) | public/assets/js/app/pages/admin/data.js:52 |
| DAT-02 | تنبيه | تنبيه خصوصية | public/assets/js/app/pages/admin/data.js:78 |
| DAT-03 | قسم/بطاقة | بيانات حساسة | public/assets/js/app/pages/admin/data.js:86 |
| DAT-04 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/data.js:86 |
| DAT-05 | زر | تنزيل CSV | public/assets/js/app/pages/admin/data.js:93 |
| DAT-06 | حقل | (نص متغير) | public/assets/js/app/pages/admin/data.js:109 |
| DAT-07 | زر | معاينة والتحقق | public/assets/js/app/pages/admin/data.js:111 |
| DAT-08 | زر | تنزيل القالب | public/assets/js/app/pages/admin/data.js:119 |
| DAT-09 | تنبيه | أعمدة غير معروفة ستُتجاهل: … | public/assets/js/app/pages/admin/data.js:170 |
| DAT-10 | عنصر قائمة | السطر | public/assets/js/app/pages/admin/data.js:177 |
| DAT-11 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/data.js:178 |
| DAT-12 | عنصر قائمة | الملاحظات | public/assets/js/app/pages/admin/data.js:187 |
| DAT-13 | جدول | نتيجة التحقق من كل صف | public/assets/js/app/pages/admin/data.js:191 |
| DAT-14 | جدول | نتيجة التحقق من كل صف | public/assets/js/app/pages/admin/data.js:192 |
| DAT-15 | زر | استيراد … | public/assets/js/app/pages/admin/data.js:197 |
| DAT-16 | تنبيه | لا توجد صفوف سليمة للاستيراد. صحح الأخطاء الموضحة ثم أعد رفع الملف. | public/assets/js/app/pages/admin/data.js:200 |
| DAT-17 | نافذة | تأكيد الاستيراد | public/assets/js/app/pages/admin/data.js:210 |
| DAT-18 | تنبيه | اكتمل الاستيراد | public/assets/js/app/pages/admin/data.js:225 |
| DAT-19 | رابط | (نص متغير) | public/assets/js/app/pages/admin/data.js:228 |
| DAT-20 | حقل | نوع البيانات المستوردة | public/assets/js/app/pages/admin/data.js:246 |
| DAT-21 | عنوان | اختر نوع البيانات وراجع الأعمدة | public/assets/js/app/pages/admin/data.js:253 |
| DAT-22 | عنوان | ارفع ملف CSV | public/assets/js/app/pages/admin/data.js:254 |
| DAT-23 | عنوان | عاين النتيجة ثم استورد الصفوف السليمة | public/assets/js/app/pages/admin/data.js:255 |
| DAT-24 | حالة فارغة | لم يُصدَّر أو يُستورد أي ملف بعد. | public/assets/js/app/pages/admin/data.js:268 |
| DAT-25 | عنصر قائمة | الوقت | public/assets/js/app/pages/admin/data.js:276 |
| DAT-26 | عنصر قائمة | العملية | public/assets/js/app/pages/admin/data.js:277 |
| DAT-27 | عنصر قائمة | التفاصيل | public/assets/js/app/pages/admin/data.js:278 |
| DAT-28 | عنصر قائمة | بواسطة | public/assets/js/app/pages/admin/data.js:279 |
| DAT-29 | جدول | آخر عمليات التصدير والاستيراد | public/assets/js/app/pages/admin/data.js:282 |
| DAT-30 | جدول | آخر عمليات التصدير والاستيراد | public/assets/js/app/pages/admin/data.js:283 |
| DAT-31 | عنوان | استيراد وتصدير البيانات | public/assets/js/app/pages/admin/data.js:298 |
| DAT-32 | عنوان | استيراد وتصدير البيانات | public/assets/js/app/pages/admin/data.js:299 |
| DAT-33 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/data.js:303 |
| DAT-34 | عنصر قائمة | تصدير | public/assets/js/app/pages/admin/data.js:303 |
| DAT-35 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/data.js:304 |
| DAT-36 | عنصر قائمة | استيراد | public/assets/js/app/pages/admin/data.js:304 |
| DAT-37 | عنوان | آخر العمليات | public/assets/js/app/pages/admin/data.js:305 |
| DAT-38 | قسم/بطاقة | آخر العمليات | public/assets/js/app/pages/admin/data.js:305 |
| DAT-39 | عنصر قائمة | السجل | public/assets/js/app/pages/admin/data.js:305 |
| DAT-40 | خيار | تصدير | public/assets/js/app/pages/admin/data.js:307 |

## CAL: التقويم (`/app#/calendar`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CAL-01 | زر | سجّل النتيجة | public/assets/js/app/pages/admin/calendar.js:85 |
| CAL-02 | رابط | (نص متغير) | public/assets/js/app/pages/admin/calendar.js:97 |
| CAL-03 | عنصر قائمة | إغلاق | public/assets/js/app/pages/admin/calendar.js:133 |
| CAL-04 | نافذة | اشترك في تقويم هاتفك | public/assets/js/app/pages/admin/calendar.js:133 |
| CAL-05 | عنصر قائمة | آيفون | public/assets/js/app/pages/admin/calendar.js:159 |
| CAL-06 | عنصر قائمة | تقويم Google / أندرويد | public/assets/js/app/pages/admin/calendar.js:176 |
| CAL-07 | عنصر قائمة | Outlook | public/assets/js/app/pages/admin/calendar.js:182 |
| CAL-08 | خيار | آيفون | public/assets/js/app/pages/admin/calendar.js:185 |
| CAL-09 | تنبيه | خصوصية | public/assets/js/app/pages/admin/calendar.js:197 |
| CAL-10 | تنبيه | توقف الرابط السابق | public/assets/js/app/pages/admin/calendar.js:202 |
| CAL-11 | زر | فتح في تطبيق التقويم | public/assets/js/app/pages/admin/calendar.js:206 |
| CAL-12 | حقل | (نص متغير) | public/assets/js/app/pages/admin/calendar.js:213 |
| CAL-13 | زر | نسخ الرابط | public/assets/js/app/pages/admin/calendar.js:213 |
| CAL-14 | تنبيه | الاشتراك مفعّل | public/assets/js/app/pages/admin/calendar.js:223 |
| CAL-15 | نافذة | إصدار رابط جديد | public/assets/js/app/pages/admin/calendar.js:234 |
| CAL-16 | زر | إصدار رابط جديد | public/assets/js/app/pages/admin/calendar.js:242 |
| CAL-17 | نافذة | إلغاء رابط التقويم | public/assets/js/app/pages/admin/calendar.js:248 |
| CAL-18 | زر | إلغاء الاشتراك | public/assets/js/app/pages/admin/calendar.js:254 |
| CAL-19 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/calendar.js:288 |
| CAL-20 | سؤال قابل للفتح | متأخرات تجاوزت تاريخها دون إنجاز: … | public/assets/js/app/pages/admin/calendar.js:344 |
| CAL-21 | عنوان | متأخرات تجاوزت تاريخها دون إنجاز: … | public/assets/js/app/pages/admin/calendar.js:344 |
| CAL-22 | حالة فارغة | لا توجد مواعيد في هذا اليوم | public/assets/js/app/pages/admin/calendar.js:355 |
| CAL-23 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/calendar.js:356 |
| CAL-24 | قسم/بطاقة | اليوم — … | public/assets/js/app/pages/admin/calendar.js:357 |
| CAL-25 | زر | موعد واحد | public/assets/js/app/pages/admin/calendar.js:386 |
| CAL-26 | زر | +… أخرى | public/assets/js/app/pages/admin/calendar.js:405 |
| CAL-27 | حالة فارغة | لا توجد مواعيد في هذا الشهر حسب التصفية الحالية | public/assets/js/app/pages/admin/calendar.js:428 |
| CAL-28 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/calendar.js:435 |
| CAL-29 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/calendar.js:436 |
| CAL-30 | قسم/بطاقة | بانتظار النتيجة (… ) | public/assets/js/app/pages/admin/calendar.js:461 |
| CAL-31 | عنوان | بانتظار النتيجة (… ) | public/assets/js/app/pages/admin/calendar.js:462 |
| CAL-32 | حالة فارغة | لا توجد مواعيد قادمة خلال الأسابيع المقبلة. | public/assets/js/app/pages/admin/calendar.js:473 |
| CAL-33 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/calendar.js:492 |
| CAL-34 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/calendar.js:493 |
| CAL-35 | زر | الشهر السابق | public/assets/js/app/pages/admin/calendar.js:519 |
| CAL-36 | زر | الشهر التالي | public/assets/js/app/pages/admin/calendar.js:521 |
| CAL-37 | زر | اليوم | public/assets/js/app/pages/admin/calendar.js:522 |
| CAL-38 | زر | (نص متغير) | public/assets/js/app/pages/admin/calendar.js:528 |
| CAL-39 | زر | اختر نوعًا واحدًا على الأقل | public/assets/js/app/pages/admin/calendar.js:551 |
| CAL-40 | زر | أضف إلى تقويم هاتفي | public/assets/js/app/pages/admin/calendar.js:570 |
| CAL-41 | عنوان | تقويمي | public/assets/js/app/pages/admin/calendar.js:571 |
| CAL-42 | عنوان | تقويمي | public/assets/js/app/pages/admin/calendar.js:572 |
| CAL-43 | زر | اشترك في تقويم هاتفك | public/assets/js/app/pages/admin/calendar.js:577 |
| CAL-44 | عنوان | التقويم | public/assets/js/app/pages/admin/calendar.js:578 |
| CAL-45 | عنوان | التقويم | public/assets/js/app/pages/admin/calendar.js:579 |
| CAL-46 | حقل | المحامي | public/assets/js/app/pages/admin/calendar.js:595 |
| CAL-47 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/calendar.js:613 |
| CAL-48 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/calendar.js:400 |

## IMP: تقرير الأثر (`/app#/impact`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| IMP-01 | حالة فارغة | (نص متغير) | public/assets/js/app/pages/admin/impact.js:16 |
| IMP-02 | سؤال قابل للفتح | عرض البيانات كجدول | public/assets/js/app/pages/admin/impact.js:39 |
| IMP-03 | عنوان | عرض البيانات كجدول | public/assets/js/app/pages/admin/impact.js:39 |
| IMP-04 | حالة فارغة | لا توجد بيانات في هذه الفترة | public/assets/js/app/pages/admin/impact.js:46 |
| IMP-05 | سؤال قابل للفتح | عرض البيانات كجدول | public/assets/js/app/pages/admin/impact.js:84 |
| IMP-06 | عنوان | عرض البيانات كجدول | public/assets/js/app/pages/admin/impact.js:84 |
| IMP-07 | عنصر قائمة | مهلة أول رد | public/assets/js/app/pages/admin/impact.js:189 |
| IMP-08 | عنصر قائمة | تنبيه الإدارة عند تجاوز المهلة | public/assets/js/app/pages/admin/impact.js:190 |
| IMP-09 | نافذة | مستوى الخدمة: مهلة أول رد | public/assets/js/app/pages/admin/impact.js:194 |
| IMP-10 | قسم/بطاقة | تقرير الأثر — برنامج الدعم القانوني | public/assets/js/app/pages/admin/impact.js:211 |
| IMP-11 | بطاقة رقم | الأسر المخدومة | public/assets/js/app/pages/admin/impact.js:223 |
| IMP-12 | بطاقة رقم | أرامل | public/assets/js/app/pages/admin/impact.js:224 |
| IMP-13 | بطاقة رقم | أبناء في الأسر المخدومة | public/assets/js/app/pages/admin/impact.js:225 |
| IMP-14 | بطاقة رقم | ملفات استشارة أُغلقت | public/assets/js/app/pages/admin/impact.js:226 |
| IMP-15 | بطاقة رقم | القيمة السنوية للحقوق المستردة | public/assets/js/app/pages/admin/impact.js:227 |
| IMP-16 | بطاقة رقم | قيمة العمل التطوعي | public/assets/js/app/pages/admin/impact.js:228 |
| IMP-17 | بطاقة رقم | متوسط زمن أول رد | public/assets/js/app/pages/admin/impact.js:229 |
| IMP-18 | بطاقة رقم | رضا المستفيدين | public/assets/js/app/pages/admin/impact.js:231 |
| IMP-19 | حالة فارغة | لم يُسجَّل أثر مالي للملفات المغلقة في هذه الفترة. سجّله من بطاقة «ال… | public/assets/js/app/pages/admin/impact.js:250 |
| IMP-20 | عنوان | الحقوق المستردة للمستفيدين | public/assets/js/app/pages/admin/impact.js:251 |
| IMP-21 | قسم/بطاقة | الحقوق المستردة للمستفيدين | public/assets/js/app/pages/admin/impact.js:252 |
| IMP-22 | عنوان | الملفات المغلقة حسب النتيجة | public/assets/js/app/pages/admin/impact.js:259 |
| IMP-23 | قسم/بطاقة | الملفات المغلقة حسب النتيجة | public/assets/js/app/pages/admin/impact.js:260 |
| IMP-24 | عنوان | المستفيدون | public/assets/js/app/pages/admin/impact.js:272 |
| IMP-25 | قسم/بطاقة | المستفيدون | public/assets/js/app/pages/admin/impact.js:273 |
| IMP-26 | عنوان | حسب المجال القانوني | public/assets/js/app/pages/admin/impact.js:280 |
| IMP-27 | قسم/بطاقة | حسب المجال القانوني | public/assets/js/app/pages/admin/impact.js:281 |
| IMP-28 | عنوان | حسب المحافظة | public/assets/js/app/pages/admin/impact.js:287 |
| IMP-29 | قسم/بطاقة | حسب المحافظة | public/assets/js/app/pages/admin/impact.js:288 |
| IMP-30 | عنوان | القيمة السنوية للحقوق المستردة شهريًا | public/assets/js/app/pages/admin/impact.js:297 |
| IMP-31 | عنوان | الاتجاه الشهري | public/assets/js/app/pages/admin/impact.js:300 |
| IMP-32 | قسم/بطاقة | الاتجاه الشهري | public/assets/js/app/pages/admin/impact.js:301 |
| IMP-33 | عنوان | المحامون المتطوعون وبرامج المسؤولية المجتمعية | public/assets/js/app/pages/admin/impact.js:314 |
| IMP-34 | قسم/بطاقة | المحامون المتطوعون وبرامج المسؤولية المجتمعية | public/assets/js/app/pages/admin/impact.js:315 |
| IMP-35 | زر | ضبط المهلة | public/assets/js/app/pages/admin/impact.js:321 |
| IMP-36 | عنوان | زمن الاستجابة ومستوى الخدمة | public/assets/js/app/pages/admin/impact.js:332 |
| IMP-37 | قسم/بطاقة | زمن الاستجابة ومستوى الخدمة | public/assets/js/app/pages/admin/impact.js:333 |
| IMP-38 | عنوان | منهجية الحساب | public/assets/js/app/pages/admin/impact.js:348 |
| IMP-39 | قسم/بطاقة | منهجية الحساب | public/assets/js/app/pages/admin/impact.js:349 |
| IMP-40 | تنبيه | لا توجد الآن طلبات تجاوزت مهلة أول رد (… ). | public/assets/js/app/pages/admin/impact.js:371 |
| IMP-41 | تنبيه | متأخرة عن مستوى الخدمة | public/assets/js/app/pages/admin/impact.js:378 |
| IMP-42 | رابط | (نص متغير) | public/assets/js/app/pages/admin/impact.js:381 |
| IMP-43 | حقل | فترة جاهزة | public/assets/js/app/pages/admin/impact.js:431 |
| IMP-44 | زر | تصدير CSV | public/assets/js/app/pages/admin/impact.js:434 |
| IMP-45 | زر | طباعة التقرير | public/assets/js/app/pages/admin/impact.js:440 |
| IMP-46 | عنوان | تقرير الأثر | public/assets/js/app/pages/admin/impact.js:441 |
| IMP-47 | عنوان | تقرير الأثر | public/assets/js/app/pages/admin/impact.js:442 |
| IMP-48 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/impact.js:447 |
| IMP-49 | عنصر قائمة | من تاريخ | public/assets/js/app/pages/admin/impact.js:393 |
| IMP-50 | عنصر قائمة | إلى تاريخ | public/assets/js/app/pages/admin/impact.js:394 |
| IMP-51 | عنصر قائمة | المجال القانوني | public/assets/js/app/pages/admin/impact.js:395 |
| IMP-52 | عنصر قائمة | المحافظة | public/assets/js/app/pages/admin/impact.js:396 |
| IMP-53 | زر | عرض التقرير | public/assets/js/app/pages/admin/impact.js:410 |
| IMP-54 | نموذج | من تاريخ | public/assets/js/app/pages/admin/impact.js:411 |

## CNF: فحص تعارض المصالح (`/app#/conflicts`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CNF-01 | تنبيه | تعارض مصالح محتمل | public/assets/js/app/pages/admin/conflicts.js:63 |
| CNF-02 | تنبيه | يحتاج مراجعة | public/assets/js/app/pages/admin/conflicts.js:65 |
| CNF-03 | تنبيه | لا تعارض | public/assets/js/app/pages/admin/conflicts.js:67 |
| CNF-04 | تنبيه | لا يوجد تعارض مسجل | public/assets/js/app/pages/admin/conflicts.js:68 |
| CNF-05 | تنبيه | الاسم المكتوب وصف عام (مثل «المطلق» أو «التاجر») ولا يصلح للمطابقة. ا… | public/assets/js/app/pages/admin/conflicts.js:74 |
| CNF-06 | حالة فارغة | لم تُسجَّل أي تطابقات في الفحوص التلقائية بعد. | public/assets/js/app/pages/admin/conflicts.js:85 |
| CNF-07 | عنصر قائمة | الوقت | public/assets/js/app/pages/admin/conflicts.js:93 |
| CNF-08 | رابط | (نص متغير) | public/assets/js/app/pages/admin/conflicts.js:98 |
| CNF-09 | رابط | (نص متغير) | public/assets/js/app/pages/admin/conflicts.js:98 |
| CNF-10 | عنصر قائمة | الملف | public/assets/js/app/pages/admin/conflicts.js:99 |
| CNF-11 | عنصر قائمة | النتيجة | public/assets/js/app/pages/admin/conflicts.js:101 |
| CNF-12 | عنصر قائمة | المستوى | public/assets/js/app/pages/admin/conflicts.js:106 |
| CNF-13 | عنصر قائمة | بواسطة | public/assets/js/app/pages/admin/conflicts.js:108 |
| CNF-14 | جدول | آخر نتائج فحص تعارض المصالح التي وُجد فيها تطابق | public/assets/js/app/pages/admin/conflicts.js:111 |
| CNF-15 | جدول | آخر نتائج فحص تعارض المصالح التي وُجد فيها تطابق | public/assets/js/app/pages/admin/conflicts.js:112 |
| CNF-16 | حالة فارغة | اكتب اسمًا أو رقمًا قوميًا ثم اضغط «افحص». | public/assets/js/app/pages/admin/conflicts.js:120 |
| CNF-17 | عنوان | كيف يعمل الفحص؟ | public/assets/js/app/pages/admin/conflicts.js:134 |
| CNF-18 | قسم/بطاقة | كيف يعمل الفحص؟ | public/assets/js/app/pages/admin/conflicts.js:135 |
| CNF-19 | عنوان | فحص تعارض المصالح | public/assets/js/app/pages/admin/conflicts.js:143 |
| CNF-20 | عنوان | فحص تعارض المصالح | public/assets/js/app/pages/admin/conflicts.js:144 |
| CNF-21 | عنوان | فحص اسم | public/assets/js/app/pages/admin/conflicts.js:146 |
| CNF-22 | قسم/بطاقة | فحص اسم | public/assets/js/app/pages/admin/conflicts.js:146 |
| CNF-23 | عنوان | آخر التنبيهات | public/assets/js/app/pages/admin/conflicts.js:146 |
| CNF-24 | قسم/بطاقة | آخر التنبيهات | public/assets/js/app/pages/admin/conflicts.js:146 |
| CNF-25 | عنصر قائمة | الاسم | public/assets/js/app/pages/admin/conflicts.js:15 |
| CNF-26 | عنصر قائمة | الرقم القومي (اختياري) | public/assets/js/app/pages/admin/conflicts.js:16 |
| CNF-27 | عنصر قائمة | صفة الشخص المطلوب فحصه | public/assets/js/app/pages/admin/conflicts.js:27 |
| CNF-28 | زر | افحص | public/assets/js/app/pages/admin/conflicts.js:53 |
| CNF-29 | نموذج | الاسم | public/assets/js/app/pages/admin/conflicts.js:54 |

## PRG: البرامج والتمويل (`/app#/programs`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| PRG-01 | نافذة | تعديل البرنامج … | public/assets/js/app/pages/admin/programs.js:163 |
| PRG-02 | عنصر قائمة | نسب التنبيه من الميزانية | public/assets/js/app/pages/admin/programs.js:206 |
| PRG-03 | عنصر قائمة | ملاحظة أسفل الفواتير المطبوعة | public/assets/js/app/pages/admin/programs.js:208 |
| PRG-04 | عنصر قائمة | تنبيه أسفل الإفادات القانونية المطبوعة | public/assets/js/app/pages/admin/programs.js:209 |
| PRG-05 | نافذة | إعدادات تنبيهات الميزانية والطباعة | public/assets/js/app/pages/admin/programs.js:228 |
| PRG-06 | رابط | (نص متغير) | public/assets/js/app/pages/admin/programs.js:241 |
| PRG-07 | زر | إعادة المحاولة | public/assets/js/app/pages/admin/programs.js:282 |
| PRG-08 | حالة فارغة | إعادة المحاولة | public/assets/js/app/pages/admin/programs.js:282 |
| PRG-09 | قسم/بطاقة | إعادة المحاولة | public/assets/js/app/pages/admin/programs.js:282 |
| PRG-10 | بطاقة رقم | البرامج النشطة | public/assets/js/app/pages/admin/programs.js:290 |
| PRG-11 | بطاقة رقم | إجمالي الميزانيات | public/assets/js/app/pages/admin/programs.js:291 |
| PRG-12 | بطاقة رقم | الإنفاق الفعلي | public/assets/js/app/pages/admin/programs.js:292 |
| PRG-13 | بطاقة رقم | المتبقي | public/assets/js/app/pages/admin/programs.js:293 |
| PRG-14 | بطاقة رقم | الأسر المستفيدة | public/assets/js/app/pages/admin/programs.js:294 |
| PRG-15 | بطاقة رقم | ملفات مفتوحة دون برنامج | public/assets/js/app/pages/admin/programs.js:302 |
| PRG-16 | زر | برنامج جديد | public/assets/js/app/pages/admin/programs.js:313 |
| PRG-17 | حالة فارغة | لا توجد برامج مطابقة للتصفية الحالية. | public/assets/js/app/pages/admin/programs.js:314 |
| PRG-18 | قسم/بطاقة | لا توجد برامج مطابقة للتصفية الحالية. | public/assets/js/app/pages/admin/programs.js:316 |
| PRG-19 | زر | إعدادات التنبيهات والطباعة | public/assets/js/app/pages/admin/programs.js:329 |
| PRG-20 | زر | برنامج جديد | public/assets/js/app/pages/admin/programs.js:330 |
| PRG-21 | عنوان | البرامج والتمويل | public/assets/js/app/pages/admin/programs.js:333 |
| PRG-22 | عنوان | البرامج والتمويل | public/assets/js/app/pages/admin/programs.js:334 |
| PRG-23 | حقل | بحث في البرامج | public/assets/js/app/pages/admin/programs.js:347 |
| PRG-24 | حقل | حالة البرنامج | public/assets/js/app/pages/admin/programs.js:359 |
| PRG-25 | حقل | نوع التمويل | public/assets/js/app/pages/admin/programs.js:371 |
| PRG-26 | حالة فارغة | (نص متغير) | public/assets/js/app/pages/admin/programs.js:392 |
| PRG-27 | زر | تعديل | public/assets/js/app/pages/admin/programs.js:438 |
| PRG-28 | عنصر قائمة | ملاحظة الإغلاق | public/assets/js/app/pages/admin/programs.js:447 |
| PRG-29 | نافذة | إغلاق البرنامج | public/assets/js/app/pages/admin/programs.js:450 |
| PRG-30 | زر | إغلاق البرنامج | public/assets/js/app/pages/admin/programs.js:454 |
| PRG-31 | نافذة | إعادة فتح البرنامج | public/assets/js/app/pages/admin/programs.js:462 |
| PRG-32 | زر | إعادة فتح البرنامج | public/assets/js/app/pages/admin/programs.js:467 |
| PRG-33 | نافذة | حذف البرنامج | public/assets/js/app/pages/admin/programs.js:476 |
| PRG-34 | زر | حذف | public/assets/js/app/pages/admin/programs.js:482 |
| PRG-35 | عنصر قائمة | البرامج والتمويل | public/assets/js/app/pages/admin/programs.js:491 |
| PRG-36 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/programs.js:494 |
| PRG-37 | عنوان | البرامج والتمويل | public/assets/js/app/pages/admin/programs.js:495 |
| PRG-38 | تنبيه | أُغلق البرنامج … . لا يقبل ربط ملفات جديدة. | public/assets/js/app/pages/admin/programs.js:500 |
| PRG-39 | تنبيه | تجاوز الميزانية | public/assets/js/app/pages/admin/programs.js:502 |
| PRG-40 | تنبيه | اقتراب من حد الميزانية | public/assets/js/app/pages/admin/programs.js:503 |
| PRG-41 | تنبيه | (نص متغير) | public/assets/js/app/pages/admin/programs.js:504 |
| PRG-42 | بطاقة رقم | الميزانية | public/assets/js/app/pages/admin/programs.js:510 |
| PRG-43 | بطاقة رقم | الإنفاق الفعلي | public/assets/js/app/pages/admin/programs.js:511 |
| PRG-44 | بطاقة رقم | المتبقي | public/assets/js/app/pages/admin/programs.js:512 |
| PRG-45 | بطاقة رقم | معدل الإنفاق الشهري | public/assets/js/app/pages/admin/programs.js:513 |
| PRG-46 | بطاقة رقم | الأسر المستفيدة | public/assets/js/app/pages/admin/programs.js:514 |
| PRG-47 | بطاقة رقم | متوسط الإنفاق للملف | public/assets/js/app/pages/admin/programs.js:516 |
| PRG-48 | عنوان | الميزانية والإنفاق | public/assets/js/app/pages/admin/programs.js:535 |
| PRG-49 | قسم/بطاقة | الميزانية والإنفاق | public/assets/js/app/pages/admin/programs.js:536 |
| PRG-50 | عنوان | قيود الصرف وشروط الجهة الممولة | public/assets/js/app/pages/admin/programs.js:552 |
| PRG-51 | عنوان | الوصف | public/assets/js/app/pages/admin/programs.js:553 |
| PRG-52 | عنوان | بيانات البرنامج والجهة الممولة | public/assets/js/app/pages/admin/programs.js:555 |
| PRG-53 | قسم/بطاقة | بيانات البرنامج والجهة الممولة | public/assets/js/app/pages/admin/programs.js:556 |
| PRG-54 | رابط | (نص متغير) | public/assets/js/app/pages/admin/programs.js:562 |
| PRG-55 | رابط | دون اسم | public/assets/js/app/pages/admin/programs.js:563 |
| PRG-56 | رابط | فتح الملف المستمر … | public/assets/js/app/pages/admin/programs.js:565 |
| PRG-57 | نافذة | إلغاء ربط الملف بالبرنامج | public/assets/js/app/pages/admin/programs.js:585 |
| PRG-58 | زر | إلغاء الربط | public/assets/js/app/pages/admin/programs.js:591 |
| PRG-59 | زر | ربط ملف | public/assets/js/app/pages/admin/programs.js:602 |
| PRG-60 | جدول | الملفات المرتبطة بالبرنامج | public/assets/js/app/pages/admin/programs.js:603 |
| PRG-61 | جدول | الملفات المرتبطة بالبرنامج | public/assets/js/app/pages/admin/programs.js:603 |
| PRG-62 | عنوان | الملفات المرتبطة بالبرنامج | public/assets/js/app/pages/admin/programs.js:604 |
| PRG-63 | قسم/بطاقة | الملفات المرتبطة بالبرنامج | public/assets/js/app/pages/admin/programs.js:605 |
| PRG-64 | عنوان | الإنفاق الشهري | public/assets/js/app/pages/admin/programs.js:629 |
| PRG-65 | قسم/بطاقة | الإنفاق الشهري | public/assets/js/app/pages/admin/programs.js:630 |
| PRG-66 | عنوان | الإنفاق حسب البند | public/assets/js/app/pages/admin/programs.js:632 |
| PRG-67 | قسم/بطاقة | الإنفاق حسب البند | public/assets/js/app/pages/admin/programs.js:632 |
| PRG-68 | عنصر قائمة | التاريخ | public/assets/js/app/pages/admin/programs.js:644 |
| PRG-69 | عنصر قائمة | البيان | public/assets/js/app/pages/admin/programs.js:645 |
| PRG-70 | رابط | (نص متغير) | public/assets/js/app/pages/admin/programs.js:646 |
| PRG-71 | رابط | (نص متغير) | public/assets/js/app/pages/admin/programs.js:646 |
| PRG-72 | عنصر قائمة | الملف | public/assets/js/app/pages/admin/programs.js:646 |
| PRG-73 | عنصر قائمة | البند | public/assets/js/app/pages/admin/programs.js:647 |
| PRG-74 | عنصر قائمة | المبلغ | public/assets/js/app/pages/admin/programs.js:648 |
| PRG-75 | جدول | بنود الإنفاق على البرنامج | public/assets/js/app/pages/admin/programs.js:650 |
| PRG-76 | جدول | بنود الإنفاق على البرنامج | public/assets/js/app/pages/admin/programs.js:651 |
| PRG-77 | عنوان | بنود الإنفاق | public/assets/js/app/pages/admin/programs.js:653 |
| PRG-78 | قسم/بطاقة | بنود الإنفاق | public/assets/js/app/pages/admin/programs.js:654 |
| PRG-79 | بطاقة رقم | الأسر المستفيدة | public/assets/js/app/pages/admin/programs.js:667 |
| PRG-80 | بطاقة رقم | استشارات أُرسل ردها للمستفيد | public/assets/js/app/pages/admin/programs.js:668 |
| PRG-81 | بطاقة رقم | ملفات مستمرة (تقاضٍ ومتابعة) | public/assets/js/app/pages/admin/programs.js:669 |
| PRG-82 | بطاقة رقم | جلسات حُضرت | public/assets/js/app/pages/admin/programs.js:670 |
| PRG-83 | عنوان | نتائج الملفات المغلقة (عدد الملفات) | public/assets/js/app/pages/admin/programs.js:675 |
| PRG-84 | قسم/بطاقة | نتائج الملفات المغلقة (عدد الملفات) | public/assets/js/app/pages/admin/programs.js:675 |
| PRG-85 | عنوان | حالة الملفات (عدد الملفات) | public/assets/js/app/pages/admin/programs.js:676 |
| PRG-86 | قسم/بطاقة | حالة الملفات (عدد الملفات) | public/assets/js/app/pages/admin/programs.js:676 |
| PRG-87 | عنوان | المجالات القانونية (عدد الملفات) | public/assets/js/app/pages/admin/programs.js:677 |
| PRG-88 | قسم/بطاقة | المجالات القانونية (عدد الملفات) | public/assets/js/app/pages/admin/programs.js:677 |
| PRG-89 | عنوان | التوزيع الجغرافي (عدد الأسر) | public/assets/js/app/pages/admin/programs.js:678 |
| PRG-90 | قسم/بطاقة | التوزيع الجغرافي (عدد الأسر) | public/assets/js/app/pages/admin/programs.js:678 |
| PRG-91 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/programs.js:681 |
| PRG-92 | قسم/بطاقة | مؤشرات الأثر | public/assets/js/app/pages/admin/programs.js:681 |
| PRG-93 | حالة فارغة | لم يصدر أي تنبيه لهذا البرنامج بعد | public/assets/js/app/pages/admin/programs.js:705 |
| PRG-94 | عنوان | تنبيهات الميزانية | public/assets/js/app/pages/admin/programs.js:706 |
| PRG-95 | قسم/بطاقة | تنبيهات الميزانية | public/assets/js/app/pages/admin/programs.js:707 |
| PRG-96 | حالة فارغة | لا توجد ملفات مطابقة غير مرتبطة بهذا البرنامج | public/assets/js/app/pages/admin/programs.js:727 |
| PRG-97 | زر | رُبط الملف … بالبرنامج | public/assets/js/app/pages/admin/programs.js:755 |
| PRG-98 | حقل | البحث عن ملف | public/assets/js/app/pages/admin/programs.js:776 |
| PRG-99 | عنصر قائمة | إغلاق | public/assets/js/app/pages/admin/programs.js:779 |
| PRG-100 | نافذة | ربط ملف ببرنامج | public/assets/js/app/pages/admin/programs.js:780 |
| PRG-101 | عنصر قائمة | الملفات | public/assets/js/app/pages/admin/programs.js:788 |
| PRG-102 | عنصر قائمة | الإنفاق | public/assets/js/app/pages/admin/programs.js:789 |
| PRG-103 | عنصر قائمة | النتائج والأثر | public/assets/js/app/pages/admin/programs.js:790 |
| PRG-104 | عنصر قائمة | التنبيهات | public/assets/js/app/pages/admin/programs.js:791 |
| PRG-105 | خيار | الملفات | public/assets/js/app/pages/admin/programs.js:793 |
| PRG-106 | حقل | جارٍ تحميل البرامج… | public/assets/js/app/components/program-picker.js:59 |
| PRG-107 | حقل | يُحتسب ما يُصرف على الملف وملفه المستمر ضمن ميزانية البرنامج المختار.… | public/assets/js/app/components/program-picker.js:64 |
| PRG-108 | نافذة | الملف خارج نطاق أهلية البرنامج | public/assets/js/app/components/program-picker.js:128 |
| PRG-109 | نافذة | الملف مرتبط ببرنامج آخر | public/assets/js/app/components/program-picker.js:139 |
| PRG-110 | زر | تغيير | public/assets/js/app/components/program-picker.js:169 |
| PRG-111 | رابط | (نص متغير) | public/assets/js/app/components/program-picker.js:175 |
| PRG-112 | حقل | دون برنامج (إلغاء الربط) | public/assets/js/app/components/program-picker.js:205 |
| PRG-113 | تنبيه | سيُلغى ربط الملف بالبرنامج، ولن يُحتسب إنفاقه ضمن أي برنامج. | public/assets/js/app/components/program-picker.js:213 |
| PRG-114 | تنبيه | (نص متغير) | public/assets/js/app/components/program-picker.js:226 |
| PRG-115 | حقل | البرنامج | public/assets/js/app/components/program-picker.js:237 |
| PRG-116 | عنصر قائمة | إلغاء | public/assets/js/app/components/program-picker.js:241 |
| PRG-117 | عنصر قائمة | حفظ | public/assets/js/app/components/program-picker.js:256 |
| PRG-118 | نافذة | برنامج التمويل للملف | public/assets/js/app/components/program-picker.js:259 |
| PRG-119 | عنصر قائمة | اسم البرنامج | public/assets/js/app/pages/admin/programs.js:106 |
| PRG-120 | عنصر قائمة | الجهة الممولة | public/assets/js/app/pages/admin/programs.js:107 |
| PRG-121 | عنصر قائمة | نوع التمويل | public/assets/js/app/pages/admin/programs.js:108 |
| PRG-122 | عنصر قائمة | رقم الاتفاقية أو المرجع | public/assets/js/app/pages/admin/programs.js:109 |
| PRG-123 | عنصر قائمة | الميزانية | public/assets/js/app/pages/admin/programs.js:110 |
| PRG-124 | عنصر قائمة | تاريخ البدء | public/assets/js/app/pages/admin/programs.js:111 |
| PRG-125 | عنصر قائمة | تاريخ الانتهاء | public/assets/js/app/pages/admin/programs.js:112 |
| PRG-126 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/programs.js:120 |
| PRG-127 | عنصر قائمة | التواصل مع الجهة الممولة (داخلي) | public/assets/js/app/pages/admin/programs.js:122 |
| PRG-128 | عنصر قائمة | المجالات القانونية المشمولة | public/assets/js/app/pages/admin/programs.js:123 |
| PRG-129 | عنصر قائمة | المحافظات المشمولة | public/assets/js/app/pages/admin/programs.js:124 |
| PRG-130 | عنصر قائمة | قيود الصرف وشروط الجهة الممولة | public/assets/js/app/pages/admin/programs.js:125 |
| PRG-131 | عنصر قائمة | وصف البرنامج | public/assets/js/app/pages/admin/programs.js:126 |

## CRL: طلبات الشركات (`/app#/company-requests`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CRL-01 | زر | (نص متغير) | public/assets/js/app/pages/admin/company-requests.js:324 |
| CRL-02 | زر | فتح | public/assets/js/app/pages/admin/company-requests.js:326 |
| CRL-03 | زر | (نص متغير) | public/assets/js/app/pages/admin/company-requests.js:327 |
| CRL-04 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/company-requests.js:339 |
| CRL-05 | رابط | (نص متغير) | public/assets/js/app/pages/admin/company-requests.js:339 |
| CRL-06 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/company-requests.js:359 |
| CRL-07 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/company-requests.js:360 |
| CRL-08 | رابط | (نص متغير) | public/assets/js/app/pages/admin/company-requests.js:376 |
| CRL-09 | عنصر قائمة | الطلب | public/assets/js/app/pages/admin/company-requests.js:376 |
| CRL-10 | عنصر قائمة | الشركة | public/assets/js/app/pages/admin/company-requests.js:377 |
| CRL-11 | عنصر قائمة | النوع | public/assets/js/app/pages/admin/company-requests.js:378 |
| CRL-12 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/company-requests.js:379 |
| CRL-13 | عنصر قائمة | الموعد | public/assets/js/app/pages/admin/company-requests.js:380 |
| CRL-14 | عنصر قائمة | المسؤول | public/assets/js/app/pages/admin/company-requests.js:381 |
| CRL-15 | عنصر قائمة | المحامي الرئيسي | public/assets/js/app/pages/admin/company-requests.js:382 |
| CRL-16 | عنصر قائمة | آخر تحديث | public/assets/js/app/pages/admin/company-requests.js:383 |
| CRL-17 | جدول | طلبات الشركات | public/assets/js/app/pages/admin/company-requests.js:385 |
| CRL-18 | جدول | طلبات الشركات | public/assets/js/app/pages/admin/company-requests.js:386 |
| CRL-19 | قسم/بطاقة | طلبات الشركات | public/assets/js/app/pages/admin/company-requests.js:388 |
| CRL-20 | حالة فارغة | (نص متغير) | public/assets/js/app/pages/admin/company-requests.js:401 |
| CRL-21 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/company-requests.js:401 |
| CRL-22 | زر | (نص متغير) | public/assets/js/app/pages/admin/company-requests.js:426 |
| CRL-23 | حقل | بحث في طلبات الشركات | public/assets/js/app/pages/admin/company-requests.js:449 |
| CRL-24 | حقل | الحالة | public/assets/js/app/pages/admin/company-requests.js:451 |
| CRL-25 | حقل | الشركة | public/assets/js/app/pages/admin/company-requests.js:452 |
| CRL-26 | حقل | الموعد | public/assets/js/app/pages/admin/company-requests.js:453 |
| CRL-27 | حقل | المسؤول | public/assets/js/app/pages/admin/company-requests.js:454 |
| CRL-28 | حقل | النوع | public/assets/js/app/pages/admin/company-requests.js:455 |
| CRL-29 | زر | إزالة هذا الفلتر | public/assets/js/app/pages/admin/company-requests.js:469 |
| CRL-30 | عنصر قائمة | لوحة المتابعة | public/assets/js/app/pages/admin/company-requests.js:482 |
| CRL-31 | زر | تحديث | public/assets/js/app/pages/admin/company-requests.js:483 |
| CRL-32 | عنوان | طلبات الشركات | public/assets/js/app/pages/admin/company-requests.js:484 |
| CRL-33 | عنوان | طلبات الشركات | public/assets/js/app/pages/admin/company-requests.js:485 |

## CRF: طلب شركة وأوراقه: القبول والاستيضاح والعرض والتسليم (`/app#/company-requests/`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| CRF-01 | رابط | (نص متغير) | public/assets/js/app/pages/admin/company-request.js:111 |
| CRF-02 | عنصر قائمة | موعد التسليم الجديد | public/assets/js/app/pages/admin/company-request.js:205 |
| CRF-03 | عنصر قائمة | السبب | public/assets/js/app/pages/admin/company-request.js:206 |
| CRF-04 | نافذة | تعديل موعد التسليم | public/assets/js/app/pages/admin/company-request.js:209 |
| CRF-05 | عنصر قائمة | السبب | public/assets/js/app/pages/admin/company-request.js:229 |
| CRF-06 | عنصر قائمة | ما تراه الشركة | public/assets/js/app/pages/admin/company-request.js:230 |
| CRF-07 | عنصر قائمة | ملاحظة داخلية | public/assets/js/app/pages/admin/company-request.js:231 |
| CRF-08 | نافذة | اعتذار عن الطلب | public/assets/js/app/pages/admin/company-request.js:235 |
| CRF-09 | عنصر قائمة | النتيجة | public/assets/js/app/pages/admin/company-request.js:250 |
| CRF-10 | عنصر قائمة | ملاحظة للشركة | public/assets/js/app/pages/admin/company-request.js:251 |
| CRF-11 | نافذة | إغلاق الطلب | public/assets/js/app/pages/admin/company-request.js:254 |
| CRF-12 | عنصر قائمة | السبب | public/assets/js/app/pages/admin/company-request.js:267 |
| CRF-13 | نافذة | إعادة فتح الطلب | public/assets/js/app/pages/admin/company-request.js:269 |
| CRF-14 | عنصر قائمة | ملاحظة المتابعة | public/assets/js/app/pages/admin/company-request.js:281 |
| CRF-15 | نافذة | تم الاطلاع على التصعيد | public/assets/js/app/pages/admin/company-request.js:283 |
| CRF-16 | عنصر قائمة | السبب (داخلي) | public/assets/js/app/pages/admin/company-request.js:296 |
| CRF-17 | نافذة | سحب العرض | public/assets/js/app/pages/admin/company-request.js:298 |
| CRF-18 | عنصر قائمة | السبب | public/assets/js/app/pages/admin/company-request.js:311 |
| CRF-19 | نافذة | سحب التسليم | public/assets/js/app/pages/admin/company-request.js:313 |
| CRF-20 | حقل | المسؤول عن الطلب | public/assets/js/app/pages/admin/company-request.js:350 |
| CRF-21 | زر | سؤال للشركة | public/assets/js/app/pages/admin/company-request.js:357 |
| CRF-22 | زر | إعداد تسليم | public/assets/js/app/pages/admin/company-request.js:358 |
| CRF-23 | زر | إغلاق الطلب | public/assets/js/app/pages/admin/company-request.js:359 |
| CRF-24 | زر | اعتذار عن الطلب | public/assets/js/app/pages/admin/company-request.js:360 |
| CRF-25 | زر | إعادة فتح الطلب | public/assets/js/app/pages/admin/company-request.js:362 |
| CRF-26 | عنصر قائمة | طلبات الشركات | public/assets/js/app/pages/admin/company-request.js:367 |
| CRF-27 | رابط | (نص متغير) | public/assets/js/app/pages/admin/company-request.js:371 |
| CRF-28 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/company-request.js:379 |
| CRF-29 | عنوان | طلبات الشركات | public/assets/js/app/pages/admin/company-request.js:380 |
| CRF-30 | زر | تعديل موعد التسليم | public/assets/js/app/pages/admin/company-request.js:429 |
| CRF-31 | عنوان | المواعيد | public/assets/js/app/pages/admin/company-request.js:431 |
| CRF-32 | قسم/بطاقة | المواعيد | public/assets/js/app/pages/admin/company-request.js:432 |
| CRF-33 | زر | إسناد من ملف العمل | public/assets/js/app/pages/admin/company-request.js:448 |
| CRF-34 | زر | إخفاء التنبيه | public/assets/js/app/pages/admin/company-request.js:449 |
| CRF-35 | زر | تم الاطلاع | public/assets/js/app/pages/admin/company-request.js:460 |
| CRF-36 | زر | بدء العمل | public/assets/js/app/pages/admin/company-request.js:475 |
| CRF-37 | زر | مراجعة العقد في الذاكرة | public/assets/js/app/pages/admin/company-request.js:486 |
| CRF-38 | زر | عرض الرد | public/assets/js/app/pages/admin/company-request.js:502 |
| CRF-39 | زر | إعداد التسليم | public/assets/js/app/pages/admin/company-request.js:507 |
| CRF-40 | زر | إعادة إشراك المحامي | public/assets/js/app/pages/admin/company-request.js:524 |
| CRF-41 | رابط | (نص متغير) | public/assets/js/app/pages/admin/company-request.js:559 |
| CRF-42 | رابط | طلب سابق … | public/assets/js/app/pages/admin/company-request.js:561 |
| CRF-43 | عنوان | المخاطر | public/assets/js/app/pages/admin/company-request.js:593 |
| CRF-44 | حقل | (نص متغير) | public/assets/js/app/pages/admin/company-request.js:600 |
| CRF-45 | عنوان | ينقصه | public/assets/js/app/pages/admin/company-request.js:604 |
| CRF-46 | زر | اسأل الشركة عن المحدد | public/assets/js/app/pages/admin/company-request.js:606 |
| CRF-47 | عنوان | من ذاكرة الشركة | public/assets/js/app/pages/admin/company-request.js:610 |
| CRF-48 | عنوان | أسئلة مقترحة للشركة | public/assets/js/app/pages/admin/company-request.js:615 |
| CRF-49 | زر | نقلها إلى سؤال للشركة | public/assets/js/app/pages/admin/company-request.js:617 |
| CRF-50 | عنوان | فحص الباقة | public/assets/js/app/pages/admin/company-request.js:632 |
| CRF-51 | زر | إعادة التحليل | public/assets/js/app/pages/admin/company-request.js:645 |
| CRF-52 | زر | تحليل الآن | public/assets/js/app/pages/admin/company-request.js:648 |
| CRF-53 | زر | بدء العمل… | public/assets/js/app/pages/admin/company-request.js:655 |
| CRF-54 | زر | سؤال للشركة | public/assets/js/app/pages/admin/company-request.js:656 |
| CRF-55 | زر | عرض سعر | public/assets/js/app/pages/admin/company-request.js:658 |
| CRF-56 | زر | اعتذار عن الطلب | public/assets/js/app/pages/admin/company-request.js:662 |
| CRF-57 | سؤال قابل للفتح | الفرز وقت القبول | public/assets/js/app/pages/admin/company-request.js:667 |
| CRF-58 | عنوان | الفرز وقت القبول | public/assets/js/app/pages/admin/company-request.js:667 |
| CRF-59 | عنوان | الفرز وقت القبول | public/assets/js/app/pages/admin/company-request.js:667 |
| CRF-60 | عنوان | الفرز المقترح | public/assets/js/app/pages/admin/company-request.js:669 |
| CRF-61 | قسم/بطاقة | الفرز المقترح | public/assets/js/app/pages/admin/company-request.js:669 |
| CRF-62 | عنوان | الوصف | public/assets/js/app/pages/admin/company-request.js:684 |
| CRF-63 | عنوان | مرسل الطلب | public/assets/js/app/pages/admin/company-request.js:700 |
| CRF-64 | عنوان | المستندات (… ) | public/assets/js/app/pages/admin/company-request.js:711 |
| CRF-65 | عنوان | الطلب كما أرسلته الشركة | public/assets/js/app/pages/admin/company-request.js:713 |
| CRF-66 | قسم/بطاقة | الطلب كما أرسلته الشركة | public/assets/js/app/pages/admin/company-request.js:714 |
| CRF-67 | حقل | نص الرسالة | public/assets/js/app/pages/admin/company-request.js:761 |
| CRF-68 | حقل | إرفاق ملفات للشركة | public/assets/js/app/pages/admin/company-request.js:764 |
| CRF-69 | حقل | (نص متغير) | public/assets/js/app/pages/admin/company-request.js:766 |
| CRF-70 | زر | إرسال للشركة | public/assets/js/app/pages/admin/company-request.js:775 |
| CRF-71 | زر | (نص متغير) | public/assets/js/app/pages/admin/company-request.js:792 |
| CRF-72 | قسم/بطاقة | المحادثة مع الشركة | public/assets/js/app/pages/admin/company-request.js:860 |
| CRF-73 | عنوان | المحادثة مع الشركة | public/assets/js/app/pages/admin/company-request.js:861 |
| CRF-74 | حالة فارغة | لا رسائل بعد. | public/assets/js/app/pages/admin/company-request.js:862 |
| CRF-75 | زر | فتح | public/assets/js/app/pages/admin/company-request.js:875 |
| CRF-76 | عنصر قائمة | الدور | public/assets/js/app/pages/admin/company-request.js:881 |
| CRF-77 | عنصر قائمة | المحامي | public/assets/js/app/pages/admin/company-request.js:882 |
| CRF-78 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/company-request.js:883 |
| CRF-79 | عنصر قائمة | الموعد | public/assets/js/app/pages/admin/company-request.js:884 |
| CRF-80 | زر | تعديل | public/assets/js/app/pages/admin/company-request.js:891 |
| CRF-81 | عنصر قائمة | صلاحيات الذاكرة | public/assets/js/app/pages/admin/company-request.js:892 |
| CRF-82 | جدول | فريق العمل | public/assets/js/app/pages/admin/company-request.js:895 |
| CRF-83 | جدول | فريق العمل | public/assets/js/app/pages/admin/company-request.js:896 |
| CRF-84 | عنوان | الآراء | public/assets/js/app/pages/admin/company-request.js:899 |
| CRF-85 | عنوان | ملفات عمل المحامين | public/assets/js/app/pages/admin/company-request.js:901 |
| CRF-86 | عنوان | عناصر الذاكرة المرتبطة بالطلب | public/assets/js/app/pages/admin/company-request.js:902 |
| CRF-87 | عنوان | العمل | public/assets/js/app/pages/admin/company-request.js:904 |
| CRF-88 | قسم/بطاقة | العمل | public/assets/js/app/pages/admin/company-request.js:905 |
| CRF-89 | زر | إعداد تسليم | public/assets/js/app/pages/admin/company-request.js:918 |
| CRF-90 | زر | متابعة | public/assets/js/app/pages/admin/company-request.js:929 |
| CRF-91 | زر | سحب التسليم | public/assets/js/app/pages/admin/company-request.js:931 |
| CRF-92 | حالة فارغة | لا تسليمات بعد. | public/assets/js/app/pages/admin/company-request.js:936 |
| CRF-93 | عنوان | التسليمات | public/assets/js/app/pages/admin/company-request.js:937 |
| CRF-94 | قسم/بطاقة | التسليمات | public/assets/js/app/pages/admin/company-request.js:938 |
| CRF-95 | زر | سحب العرض | public/assets/js/app/pages/admin/company-request.js:964 |
| CRF-96 | عنوان | التكاليف على هذا الطلب | public/assets/js/app/pages/admin/company-request.js:972 |
| CRF-97 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/company-request.js:977 |
| CRF-98 | قسم/بطاقة | عروض الأسعار والرسوم | public/assets/js/app/pages/admin/company-request.js:978 |
| CRF-99 | سؤال قابل للفتح | السجل (… ) | public/assets/js/app/pages/admin/company-request.js:984 |
| CRF-100 | عنوان | السجل (… ) | public/assets/js/app/pages/admin/company-request.js:984 |
| CRF-101 | عنوان | السجل (… ) | public/assets/js/app/pages/admin/company-request.js:984 |
| CRF-102 | حقل | (نص متغير) | public/assets/js/app/components/company-accept-sheet.js:223 |
| CRF-103 | حقل | (نص متغير) | public/assets/js/app/components/company-accept-sheet.js:274 |
| CRF-104 | زر | حذفها من النص | public/assets/js/app/components/company-accept-sheet.js:343 |
| CRF-105 | تنبيه | يذكر النص «… » من موظفي الشركة؛ سيُحذف تلقائيًا قبل وصوله للمحامي. اح… | public/assets/js/app/components/company-accept-sheet.js:345 |
| CRF-106 | حقل | (نص متغير) | public/assets/js/app/components/company-accept-sheet.js:353 |
| CRF-107 | حقل | اسم الطرف … | public/assets/js/app/components/company-accept-sheet.js:365 |
| CRF-108 | حقل | صفة الطرف … | public/assets/js/app/components/company-accept-sheet.js:368 |
| CRF-109 | زر | حذف الطرف … | public/assets/js/app/components/company-accept-sheet.js:370 |
| CRF-110 | زر | إضافة طرف | public/assets/js/app/components/company-accept-sheet.js:373 |
| CRF-111 | حقل | (نص متغير) | public/assets/js/app/components/company-accept-sheet.js:384 |
| CRF-112 | حقل | المسؤول عن الطلب | public/assets/js/app/components/company-accept-sheet.js:401 |
| CRF-113 | حقل | (نص متغير) | public/assets/js/app/components/company-accept-sheet.js:423 |
| CRF-114 | سؤال قابل للفتح | مستبعد لهذه الشركة (… ) | public/assets/js/app/components/company-accept-sheet.js:448 |
| CRF-115 | عنوان | مستبعد لهذه الشركة (… ) | public/assets/js/app/components/company-accept-sheet.js:448 |
| CRF-116 | قسم/بطاقة | (نص متغير) | public/assets/js/app/components/company-accept-sheet.js:471 |
| CRF-117 | عنوان | (نص متغير) | public/assets/js/app/components/company-accept-sheet.js:471 |
| CRF-118 | تنبيه | اختر المحامي الرئيسي. | public/assets/js/app/components/company-accept-sheet.js:532 |
| CRF-119 | تنبيه | (نص متغير) | public/assets/js/app/components/company-accept-sheet.js:547 |
| CRF-120 | زر | مراجعة التغييرات | public/assets/js/app/components/company-accept-sheet.js:561 |
| CRF-121 | زر | متابعة رغم ذلك | public/assets/js/app/components/company-accept-sheet.js:576 |
| CRF-122 | حقل | (نص متغير) | public/assets/js/app/components/company-accept-sheet.js:581 |
| CRF-123 | رابط | فتح | public/assets/js/app/components/company-accept-sheet.js:587 |
| CRF-124 | تنبيه | تعارض مصالح محتمل | public/assets/js/app/components/company-accept-sheet.js:591 |
| CRF-125 | زر | إرسال طلب موافقة للشركة | public/assets/js/app/components/company-accept-sheet.js:601 |
| CRF-126 | زر | مجانًا — بقرار الإدارة | public/assets/js/app/components/company-accept-sheet.js:618 |
| CRF-127 | زر | اعتذار عن الطلب | public/assets/js/app/components/company-accept-sheet.js:621 |
| CRF-128 | زر | إعداد عرض سعر | public/assets/js/app/components/company-accept-sheet.js:625 |
| CRF-129 | زر | فتح الطلب | public/assets/js/app/components/company-accept-sheet.js:628 |
| CRF-130 | زر | الإسناد رغم الاستبعاد | public/assets/js/app/components/company-accept-sheet.js:632 |
| CRF-131 | تنبيه | (نص متغير) | public/assets/js/app/components/company-accept-sheet.js:681 |
| CRF-132 | تنبيه | تُحفظ الخطة مع عرض السعر، ويبدأ العمل بها تلقائيًا عند موافقة الشركة. | public/assets/js/app/components/company-accept-sheet.js:707 |
| CRF-133 | عنصر قائمة | إلغاء | public/assets/js/app/components/company-accept-sheet.js:718 |
| CRF-134 | عنصر قائمة | (نص متغير) | public/assets/js/app/components/company-accept-sheet.js:719 |
| CRF-135 | نافذة | خطة البدء | public/assets/js/app/components/company-accept-sheet.js:759 |
| CRF-136 | حقل | (نص متغير) | public/assets/js/app/components/company-clarify-sheet.js:30 |
| CRF-137 | حقل | البند … | public/assets/js/app/components/company-clarify-sheet.js:52 |
| CRF-138 | زر | حذف البند … | public/assets/js/app/components/company-clarify-sheet.js:54 |
| CRF-139 | زر | إضافة بند | public/assets/js/app/components/company-clarify-sheet.js:60 |
| CRF-140 | تنبيه | اكتب نص الرسالة. | public/assets/js/app/components/company-clarify-sheet.js:79 |
| CRF-141 | تنبيه | (نص متغير) | public/assets/js/app/components/company-clarify-sheet.js:93 |
| CRF-142 | عنوان | كما ستراها الشركة | public/assets/js/app/components/company-clarify-sheet.js:116 |
| CRF-143 | عنصر قائمة | إلغاء | public/assets/js/app/components/company-clarify-sheet.js:119 |
| CRF-144 | عنصر قائمة | إرسال للشركة | public/assets/js/app/components/company-clarify-sheet.js:120 |
| CRF-145 | نافذة | سؤال للشركة | public/assets/js/app/components/company-clarify-sheet.js:127 |
| CRF-146 | زر | (نص متغير) | public/assets/js/app/components/company-quote-sheet.js:73 |
| CRF-147 | حقل | (نص متغير) | public/assets/js/app/components/company-quote-sheet.js:96 |
| CRF-148 | زر | تعديل خطة البدء | public/assets/js/app/components/company-quote-sheet.js:108 |
| CRF-149 | تنبيه | أعدّ خطة البدء، أو اختر «يعود الطلب إليّ لأبدأ العمل». | public/assets/js/app/components/company-quote-sheet.js:164 |
| CRF-150 | تنبيه | (نص متغير) | public/assets/js/app/components/company-quote-sheet.js:186 |
| CRF-151 | عنوان | كما ستراه الشركة | public/assets/js/app/components/company-quote-sheet.js:210 |
| CRF-152 | عنصر قائمة | إلغاء | public/assets/js/app/components/company-quote-sheet.js:213 |
| CRF-153 | عنصر قائمة | إرسال العرض للشركة | public/assets/js/app/components/company-quote-sheet.js:214 |
| CRF-154 | نافذة | عرض سعر للشركة | public/assets/js/app/components/company-quote-sheet.js:221 |
| CRF-155 | حقل | الرأي المعتمد | public/assets/js/app/components/company-deliverable-sheet.js:85 |
| CRF-156 | زر | تعبئة من الرأي المعتمد | public/assets/js/app/components/company-deliverable-sheet.js:140 |
| CRF-157 | زر | اقتراح من الرأي المعتمد | public/assets/js/app/components/company-deliverable-sheet.js:141 |
| CRF-158 | زر | إدراج نص الرأي المعتمد | public/assets/js/app/components/company-deliverable-sheet.js:142 |
| CRF-159 | حقل | رفع ملف جديد | public/assets/js/app/components/company-deliverable-sheet.js:149 |
| CRF-160 | حقل | (نص متغير) | public/assets/js/app/components/company-deliverable-sheet.js:164 |
| CRF-161 | حقل | (نص متغير) | public/assets/js/app/components/company-deliverable-sheet.js:229 |
| CRF-162 | حقل | (نص متغير) | public/assets/js/app/components/company-deliverable-sheet.js:231 |
| CRF-163 | حقل | (نص متغير) | public/assets/js/app/components/company-deliverable-sheet.js:232 |
| CRF-164 | حقل | سبب الإرسال رغم ذلك | public/assets/js/app/components/company-deliverable-sheet.js:233 |
| CRF-165 | عنوان | جاهزية الإرسال | public/assets/js/app/components/company-deliverable-sheet.js:240 |
| CRF-166 | تنبيه | (نص متغير) | public/assets/js/app/components/company-deliverable-sheet.js:329 |
| CRF-167 | تنبيه | لا يُرسل التسليم قبل أن تمر كل ضوابط «جاهزية الإرسال». | public/assets/js/app/components/company-deliverable-sheet.js:370 |
| CRF-168 | تنبيه | (نص متغير) | public/assets/js/app/components/company-deliverable-sheet.js:386 |
| CRF-169 | عنوان | كما ستراه الشركة | public/assets/js/app/components/company-deliverable-sheet.js:417 |
| CRF-170 | عنصر قائمة | إلغاء | public/assets/js/app/components/company-deliverable-sheet.js:420 |
| CRF-171 | عنصر قائمة | معاينة كما ستراه الشركة | public/assets/js/app/components/company-deliverable-sheet.js:421 |
| CRF-172 | عنصر قائمة | حفظ مسودة | public/assets/js/app/components/company-deliverable-sheet.js:422 |
| CRF-173 | عنصر قائمة | إرسال للشركة | public/assets/js/app/components/company-deliverable-sheet.js:423 |
| CRF-174 | نافذة | تسليم — الإصدار … | public/assets/js/app/components/company-deliverable-sheet.js:432 |
| CRF-175 | عنصر قائمة | إلغاء | public/assets/js/app/components/company-memory-grants.js:39 |
| CRF-176 | تنبيه | (نص متغير) | public/assets/js/app/components/company-memory-grants.js:49 |
| CRF-177 | عنصر قائمة | حفظ الصلاحيات | public/assets/js/app/components/company-memory-grants.js:53 |
| CRF-178 | نافذة | صلاحيات الذاكرة | public/assets/js/app/components/company-memory-grants.js:61 |
| CRF-179 | حقل | (نص متغير) | public/assets/js/app/components/company-memory-grants.js:73 |
| CRF-180 | تنبيه | (نص متغير) | public/assets/js/app/components/company-memory-grants.js:80 |
| CRF-181 | عنصر قائمة | النوع | public/assets/js/app/components/company-accept-sheet.js:187 |
| CRF-182 | عنصر قائمة | المجال | public/assets/js/app/components/company-accept-sheet.js:188 |
| CRF-183 | عنصر قائمة | المهارات | public/assets/js/app/components/company-accept-sheet.js:189 |
| CRF-184 | عنصر قائمة | الحجم | public/assets/js/app/components/company-accept-sheet.js:199 |
| CRF-185 | عنصر قائمة | الاستعجال | public/assets/js/app/components/company-accept-sheet.js:202 |
| CRF-186 | نموذج | النوع | public/assets/js/app/components/company-accept-sheet.js:204 |
| CRF-187 | عنصر قائمة | موعد التسليم (يدويًا) | public/assets/js/app/components/company-accept-sheet.js:211 |
| CRF-188 | عنصر قائمة | السبب | public/assets/js/app/components/company-accept-sheet.js:212 |
| CRF-189 | نموذج | موعد التسليم (يدويًا) | public/assets/js/app/components/company-accept-sheet.js:214 |
| CRF-190 | عنصر قائمة | مراجعة نهائية مطلوبة | public/assets/js/app/components/company-accept-sheet.js:307 |
| CRF-191 | عنصر قائمة | درجة المخاطر | public/assets/js/app/components/company-accept-sheet.js:309 |
| CRF-192 | نموذج | مراجعة نهائية مطلوبة | public/assets/js/app/components/company-accept-sheet.js:311 |
| CRF-193 | عنصر قائمة | عنوان ملف العمل | public/assets/js/app/components/company-accept-sheet.js:318 |
| CRF-194 | عنصر قائمة | ملخص للمحامي | public/assets/js/app/components/company-accept-sheet.js:319 |
| CRF-195 | عنصر قائمة | المسائل القانونية | public/assets/js/app/components/company-accept-sheet.js:320 |
| CRF-196 | نموذج | عنوان ملف العمل | public/assets/js/app/components/company-accept-sheet.js:322 |
| CRF-197 | عنصر قائمة | نص الرسالة | public/assets/js/app/components/company-accept-sheet.js:461 |
| CRF-198 | نموذج | نص الرسالة | public/assets/js/app/components/company-accept-sheet.js:461 |
| CRF-199 | عنصر قائمة | النوع | public/assets/js/app/components/company-quote-sheet.js:45 |
| CRF-200 | عنصر قائمة | المبلغ | public/assets/js/app/components/company-quote-sheet.js:46 |
| CRF-201 | عنصر قائمة | نطاق العمل | public/assets/js/app/components/company-quote-sheet.js:47 |
| CRF-202 | عنصر قائمة | الافتراضات | public/assets/js/app/components/company-quote-sheet.js:48 |
| CRF-203 | عنصر قائمة | غير مشمول | public/assets/js/app/components/company-quote-sheet.js:49 |
| CRF-204 | عنصر قائمة | صالح لمدة (يومًا) | public/assets/js/app/components/company-quote-sheet.js:50 |
| CRF-205 | عنصر قائمة | رسالة مع العرض | public/assets/js/app/components/company-quote-sheet.js:51 |
| CRF-206 | نموذج | النوع | public/assets/js/app/components/company-quote-sheet.js:53 |
| CRF-207 | عنصر قائمة | نوع التسليم | public/assets/js/app/components/company-deliverable-sheet.js:62 |
| CRF-208 | عنصر قائمة | درجة المخاطر | public/assets/js/app/components/company-deliverable-sheet.js:63 |
| CRF-209 | عنصر قائمة | العنوان | public/assets/js/app/components/company-deliverable-sheet.js:64 |
| CRF-210 | عنصر قائمة | الخلاصة التنفيذية | public/assets/js/app/components/company-deliverable-sheet.js:65 |
| CRF-211 | عنصر قائمة | التوصيات | public/assets/js/app/components/company-deliverable-sheet.js:66 |
| CRF-212 | عنصر قائمة | النص الكامل | public/assets/js/app/components/company-deliverable-sheet.js:67 |
| CRF-213 | عنصر قائمة | تسليم نهائي | public/assets/js/app/components/company-deliverable-sheet.js:68 |
| CRF-214 | عنصر قائمة | رسالة مع التسليم (اختياري) | public/assets/js/app/components/company-deliverable-sheet.js:69 |
| CRF-215 | نموذج | نوع التسليم | public/assets/js/app/components/company-deliverable-sheet.js:71 |
| CRF-216 | عنصر | (نص متغير) | public/assets/js/app/pages/admin/company-request.js:115 |

## COL: قائمة الشركات (`/app#/companies`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| COL-01 | زر | إضافة شركة | public/assets/js/app/pages/admin/companies.js:117 |
| COL-02 | حالة فارغة | لا توجد شركات بعد | public/assets/js/app/pages/admin/companies.js:118 |
| COL-03 | قسم/بطاقة | أضيفوا أول شركة لتبدأ طلباتها في الوصول إلى «طلبات الشركات». | public/assets/js/app/pages/admin/companies.js:120 |
| COL-04 | رابط | (نص متغير) | public/assets/js/app/pages/admin/companies.js:137 |
| COL-05 | عنصر قائمة | الشركة | public/assets/js/app/pages/admin/companies.js:137 |
| COL-06 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/companies.js:148 |
| COL-07 | عنصر قائمة | الباقة | public/assets/js/app/pages/admin/companies.js:150 |
| COL-08 | عنصر قائمة | مدير العلاقة | public/assets/js/app/pages/admin/companies.js:151 |
| COL-09 | عنصر قائمة | المستخدمون | public/assets/js/app/pages/admin/companies.js:152 |
| COL-10 | عنصر قائمة | الطلبات المفتوحة | public/assets/js/app/pages/admin/companies.js:153 |
| COL-11 | عنصر قائمة | صحة الخدمة | public/assets/js/app/pages/admin/companies.js:154 |
| COL-12 | عنصر قائمة | تجديدات خلال 30 يومًا | public/assets/js/app/pages/admin/companies.js:155 |
| COL-13 | جدول | الشركات العميلة | public/assets/js/app/pages/admin/companies.js:157 |
| COL-14 | جدول | الشركات العميلة | public/assets/js/app/pages/admin/companies.js:158 |
| COL-15 | قسم/بطاقة | الشركات العميلة | public/assets/js/app/pages/admin/companies.js:160 |
| COL-16 | عنصر قائمة | لوحة المتابعة | public/assets/js/app/pages/admin/companies.js:184 |
| COL-17 | زر | إضافة شركة | public/assets/js/app/pages/admin/companies.js:185 |
| COL-18 | عنوان | الشركات العميلة | public/assets/js/app/pages/admin/companies.js:186 |
| COL-19 | عنوان | الشركات العميلة | public/assets/js/app/pages/admin/companies.js:187 |
| COL-20 | حقل | بحث في الشركات | public/assets/js/app/pages/admin/companies.js:190 |
| COL-21 | حقل | الحالة | public/assets/js/app/pages/admin/companies.js:191 |
| COL-22 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/companies.js:288 |
| COL-23 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/companies.js:288 |
| COL-24 | تنبيه | (نص متغير) | public/assets/js/app/pages/admin/companies.js:428 |
| COL-25 | عنصر قائمة | إلغاء | public/assets/js/app/pages/admin/companies.js:515 |
| COL-26 | عنصر قائمة | إنشاء الشركة وإرسال الدعوة | public/assets/js/app/pages/admin/companies.js:516 |
| COL-27 | نافذة | إضافة شركة | public/assets/js/app/pages/admin/companies.js:523 |
| COL-28 | تنبيه | أرسلنا الدعوة إلى | public/assets/js/app/pages/admin/companies.js:546 |
| COL-29 | تنبيه | البريد غير مُعدّ: انسخ الرابط وأرسله بنفسك — يظهر الآن فقط. | public/assets/js/app/pages/admin/companies.js:550 |
| COL-30 | حقل | رابط الدعوة | public/assets/js/app/pages/admin/companies.js:551 |
| COL-31 | زر | نسخ | public/assets/js/app/pages/admin/companies.js:551 |
| COL-32 | تنبيه | تشابه أسماء محتمل: … — راجعها قبل بدء العمل. | public/assets/js/app/pages/admin/companies.js:561 |
| COL-33 | عنصر قائمة | إغلاق | public/assets/js/app/pages/admin/companies.js:565 |
| COL-34 | عنصر قائمة | فتح صفحة الشركة | public/assets/js/app/pages/admin/companies.js:566 |
| COL-35 | نافذة | أُنشئت | public/assets/js/app/pages/admin/companies.js:568 |
| COL-36 | عنصر قائمة | الاسم المعروض | public/assets/js/app/pages/admin/companies.js:293 |
| COL-37 | عنصر قائمة | البادئة | public/assets/js/app/pages/admin/companies.js:294 |
| COL-38 | نموذج | الاسم المعروض | public/assets/js/app/pages/admin/companies.js:296 |
| COL-39 | عنصر قائمة | الاسم القانوني | public/assets/js/app/pages/admin/companies.js:305 |
| COL-40 | عنصر قائمة | السجل التجاري | public/assets/js/app/pages/admin/companies.js:306 |
| COL-41 | عنصر قائمة | البطاقة الضريبية | public/assets/js/app/pages/admin/companies.js:307 |
| COL-42 | عنصر قائمة | النشاط | public/assets/js/app/pages/admin/companies.js:308 |
| COL-43 | عنصر قائمة | الحجم | public/assets/js/app/pages/admin/companies.js:309 |
| COL-44 | عنصر قائمة | العنوان | public/assets/js/app/pages/admin/companies.js:310 |
| COL-45 | نموذج | الاسم القانوني | public/assets/js/app/pages/admin/companies.js:312 |
| COL-46 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/companies.js:330 |
| COL-47 | عنصر قائمة | مدة التجربة (يومًا) | public/assets/js/app/pages/admin/companies.js:332 |
| COL-48 | عنصر قائمة | الباقة | public/assets/js/app/pages/admin/companies.js:333 |
| COL-49 | عنصر قائمة | تاريخ البدء | public/assets/js/app/pages/admin/companies.js:334 |
| COL-50 | عنصر قائمة | التجديد | public/assets/js/app/pages/admin/companies.js:345 |
| COL-51 | نموذج | الحالة | public/assets/js/app/pages/admin/companies.js:348 |
| COL-52 | عنصر قائمة | الاسم القانوني للكيان | public/assets/js/app/pages/admin/companies.js:370 |
| COL-53 | عنصر قائمة | الشكل القانوني | public/assets/js/app/pages/admin/companies.js:371 |
| COL-54 | نموذج | الاسم القانوني للكيان | public/assets/js/app/pages/admin/companies.js:373 |
| COL-55 | عنصر قائمة | مدير العلاقة (من فريقنا) | public/assets/js/app/pages/admin/companies.js:386 |
| COL-56 | نموذج | مدير العلاقة (من فريقنا) | public/assets/js/app/pages/admin/companies.js:389 |
| COL-57 | عنصر قائمة | الاسم | public/assets/js/app/pages/admin/companies.js:395 |
| COL-58 | عنصر قائمة | البريد الإلكتروني | public/assets/js/app/pages/admin/companies.js:396 |
| COL-59 | عنصر قائمة | الوظيفة | public/assets/js/app/pages/admin/companies.js:397 |
| COL-60 | عنصر قائمة | الهاتف | public/assets/js/app/pages/admin/companies.js:398 |
| COL-61 | عنصر قائمة | يتلقى إشعارات التكاليف الإضافية (جهة الفواتير) | public/assets/js/app/pages/admin/companies.js:399 |
| COL-62 | نموذج | الاسم | public/assets/js/app/pages/admin/companies.js:401 |

## COF: ملف شركة (`/app#/companies/`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| COF-01 | عنصر قائمة | الشركات العميلة | public/assets/js/app/pages/admin/company-detail.js:90 |
| COF-02 | زر | تعديل بيانات الشركة | public/assets/js/app/pages/admin/company-detail.js:92 |
| COF-03 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/company-detail.js:93 |
| COF-04 | عنوان | الشركات العميلة | public/assets/js/app/pages/admin/company-detail.js:94 |
| COF-05 | عنصر قائمة | الاسم المعروض | public/assets/js/app/pages/admin/company-detail.js:108 |
| COF-06 | عنصر قائمة | البادئة | public/assets/js/app/pages/admin/company-detail.js:109 |
| COF-07 | عنصر قائمة | الاسم القانوني | public/assets/js/app/pages/admin/company-detail.js:110 |
| COF-08 | عنصر قائمة | السجل التجاري | public/assets/js/app/pages/admin/company-detail.js:111 |
| COF-09 | عنصر قائمة | البطاقة الضريبية | public/assets/js/app/pages/admin/company-detail.js:112 |
| COF-10 | عنصر قائمة | النشاط | public/assets/js/app/pages/admin/company-detail.js:113 |
| COF-11 | عنصر قائمة | العنوان | public/assets/js/app/pages/admin/company-detail.js:114 |
| COF-12 | عنصر قائمة | نهاية الفترة التجريبية | public/assets/js/app/pages/admin/company-detail.js:115 |
| COF-13 | عنصر قائمة | الظهور الافتراضي للطلبات الجديدة | public/assets/js/app/pages/admin/company-detail.js:116 |
| COF-14 | عنصر قائمة | من يوافق على عروض الأسعار | public/assets/js/app/pages/admin/company-detail.js:127 |
| COF-15 | عنصر قائمة | إظهار اسم مدير العلاقة للشركة («مدير علاقتكم لدينا») | public/assets/js/app/pages/admin/company-detail.js:129 |
| COF-16 | عنصر قائمة | إلزام كل مستخدمي الشركة بالتحقق بخطوتين | public/assets/js/app/pages/admin/company-detail.js:130 |
| COF-17 | نافذة | تعديل بيانات الشركة | public/assets/js/app/pages/admin/company-detail.js:174 |
| COF-18 | زر | تغيير الحالة | public/assets/js/app/pages/admin/company-detail.js:194 |
| COF-19 | تنبيه | البوابة للاطلاع فقط: لا تستطيع الشركة إرسال طلبات أو الرد الآن. | public/assets/js/app/pages/admin/company-detail.js:208 |
| COF-20 | عنوان | الحالة والاشتراك | public/assets/js/app/pages/admin/company-detail.js:210 |
| COF-21 | قسم/بطاقة | الحالة والاشتراك | public/assets/js/app/pages/admin/company-detail.js:211 |
| COF-22 | عنوان | الاستخدام في الدورة الحالية | public/assets/js/app/pages/admin/company-detail.js:231 |
| COF-23 | قسم/بطاقة | الاستخدام في الدورة الحالية | public/assets/js/app/pages/admin/company-detail.js:232 |
| COF-24 | زر | كل الطلبات | public/assets/js/app/pages/admin/company-detail.js:238 |
| COF-25 | رابط | (نص متغير) | public/assets/js/app/pages/admin/company-detail.js:246 |
| COF-26 | حالة فارغة | لا طلبات مفتوحة لهذه الشركة. | public/assets/js/app/pages/admin/company-detail.js:252 |
| COF-27 | عنوان | الطلبات المفتوحة | public/assets/js/app/pages/admin/company-detail.js:253 |
| COF-28 | قسم/بطاقة | الطلبات المفتوحة | public/assets/js/app/pages/admin/company-detail.js:254 |
| COF-29 | رابط | (نص متغير) | public/assets/js/app/pages/admin/company-detail.js:267 |
| COF-30 | حالة فارغة | لا مواعيد خلال الشهرين القادمين. | public/assets/js/app/pages/admin/company-detail.js:272 |
| COF-31 | عنوان | مواعيد قادمة | public/assets/js/app/pages/admin/company-detail.js:273 |
| COF-32 | قسم/بطاقة | مواعيد قادمة | public/assets/js/app/pages/admin/company-detail.js:274 |
| COF-33 | حقل | ملاحظات داخلية | public/assets/js/app/pages/admin/company-detail.js:278 |
| COF-34 | حقل | مدير العلاقة | public/assets/js/app/pages/admin/company-detail.js:285 |
| COF-35 | زر | حفظ | public/assets/js/app/pages/admin/company-detail.js:309 |
| COF-36 | عنوان | مدير العلاقة والملاحظات | public/assets/js/app/pages/admin/company-detail.js:313 |
| COF-37 | قسم/بطاقة | مدير العلاقة والملاحظات | public/assets/js/app/pages/admin/company-detail.js:314 |
| COF-38 | عنوان | تشابه أسماء محتمل | public/assets/js/app/pages/admin/company-detail.js:330 |
| COF-39 | قسم/بطاقة | تشابه أسماء محتمل | public/assets/js/app/pages/admin/company-detail.js:331 |
| COF-40 | عنصر قائمة | الحالة الجديدة | public/assets/js/app/pages/admin/company-detail.js:341 |
| COF-41 | عنصر قائمة | السبب | public/assets/js/app/pages/admin/company-detail.js:342 |
| COF-42 | نافذة | تغيير حالة الشركة | public/assets/js/app/pages/admin/company-detail.js:351 |
| COF-43 | رابط | (نص متغير) | public/assets/js/app/pages/admin/company-detail.js:376 |
| COF-44 | عنصر قائمة | الطلب | public/assets/js/app/pages/admin/company-detail.js:376 |
| COF-45 | عنصر قائمة | النوع | public/assets/js/app/pages/admin/company-detail.js:377 |
| COF-46 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/company-detail.js:378 |
| COF-47 | عنصر قائمة | الموعد | public/assets/js/app/pages/admin/company-detail.js:379 |
| COF-48 | عنصر قائمة | الأولوية | public/assets/js/app/pages/admin/company-detail.js:380 |
| COF-49 | عنصر قائمة | المسؤول | public/assets/js/app/pages/admin/company-detail.js:381 |
| COF-50 | عنصر قائمة | آخر تحديث | public/assets/js/app/pages/admin/company-detail.js:382 |
| COF-51 | جدول | طلبات الشركة | public/assets/js/app/pages/admin/company-detail.js:384 |
| COF-52 | جدول | طلبات الشركة | public/assets/js/app/pages/admin/company-detail.js:385 |
| COF-53 | قسم/بطاقة | طلبات الشركة | public/assets/js/app/pages/admin/company-detail.js:387 |
| COF-54 | حقل | الحالة | public/assets/js/app/pages/admin/company-detail.js:407 |
| COF-55 | حقل | بحث في طلبات الشركة | public/assets/js/app/pages/admin/company-detail.js:409 |
| COF-56 | زر | دعوة مستخدم | public/assets/js/app/pages/admin/company-detail.js:426 |
| COF-57 | عنصر قائمة | المستخدم | public/assets/js/app/pages/admin/company-detail.js:438 |
| COF-58 | عنصر قائمة | البريد والهاتف | public/assets/js/app/pages/admin/company-detail.js:440 |
| COF-59 | عنصر قائمة | الدور | public/assets/js/app/pages/admin/company-detail.js:445 |
| COF-60 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/company-detail.js:447 |
| COF-61 | عنصر قائمة | آخر دخول | public/assets/js/app/pages/admin/company-detail.js:448 |
| COF-62 | عنصر قائمة | إجراءات | public/assets/js/app/pages/admin/company-detail.js:449 |
| COF-63 | جدول | مستخدمو بوابة الشركة | public/assets/js/app/pages/admin/company-detail.js:451 |
| COF-64 | جدول | مستخدمو بوابة الشركة | public/assets/js/app/pages/admin/company-detail.js:452 |
| COF-65 | عنوان | المستخدمون | public/assets/js/app/pages/admin/company-detail.js:454 |
| COF-66 | قسم/بطاقة | المستخدمون | public/assets/js/app/pages/admin/company-detail.js:455 |
| COF-67 | زر | تعديل | public/assets/js/app/pages/admin/company-detail.js:460 |
| COF-68 | زر | إعادة إرسال الدعوة | public/assets/js/app/pages/admin/company-detail.js:461 |
| COF-69 | زر | أمان الحساب | public/assets/js/app/pages/admin/company-detail.js:462 |
| COF-70 | تنبيه | البريد غير مُعدّ: انسخ الرابط وأرسله بنفسك — يظهر الآن فقط. | public/assets/js/app/pages/admin/company-detail.js:478 |
| COF-71 | حقل | رابط الدعوة | public/assets/js/app/pages/admin/company-detail.js:479 |
| COF-72 | زر | نسخ | public/assets/js/app/pages/admin/company-detail.js:479 |
| COF-73 | عنصر قائمة | تم | public/assets/js/app/pages/admin/company-detail.js:481 |
| COF-74 | نافذة | رابط الدعوة | public/assets/js/app/pages/admin/company-detail.js:482 |
| COF-75 | عنصر قائمة | الاسم | public/assets/js/app/pages/admin/company-detail.js:493 |
| COF-76 | عنصر قائمة | البريد الإلكتروني | public/assets/js/app/pages/admin/company-detail.js:494 |
| COF-77 | عنصر قائمة | الوظيفة | public/assets/js/app/pages/admin/company-detail.js:495 |
| COF-78 | عنصر قائمة | الهاتف | public/assets/js/app/pages/admin/company-detail.js:496 |
| COF-79 | عنصر قائمة | الدور | public/assets/js/app/pages/admin/company-detail.js:505 |
| COF-80 | عنصر قائمة | جهة الفواتير (تتلقى إشعارات التكاليف الإضافية) | public/assets/js/app/pages/admin/company-detail.js:507 |
| COF-81 | نافذة | دعوة مستخدم | public/assets/js/app/pages/admin/company-detail.js:516 |
| COF-82 | عنصر قائمة | الاسم | public/assets/js/app/pages/admin/company-detail.js:525 |
| COF-83 | عنصر قائمة | الوظيفة | public/assets/js/app/pages/admin/company-detail.js:526 |
| COF-84 | عنصر قائمة | الهاتف | public/assets/js/app/pages/admin/company-detail.js:527 |
| COF-85 | عنصر قائمة | البريد الإلكتروني | public/assets/js/app/pages/admin/company-detail.js:535 |
| COF-86 | عنصر قائمة | الدور | public/assets/js/app/pages/admin/company-detail.js:545 |
| COF-87 | عنصر قائمة | جهة الفواتير (تتلقى إشعارات التكاليف الإضافية) | public/assets/js/app/pages/admin/company-detail.js:547 |
| COF-88 | عنصر قائمة | الحساب نشط | public/assets/js/app/pages/admin/company-detail.js:548 |
| COF-89 | نافذة | تغيير البريد الإلكتروني | public/assets/js/app/pages/admin/company-detail.js:561 |
| COF-90 | نافذة | تعديل | public/assets/js/app/pages/admin/company-detail.js:571 |
| COF-91 | نافذة | (نص متغير) | public/assets/js/app/pages/admin/company-detail.js:591 |
| COF-92 | تنبيه | أرسلنا الرابط بالبريد أيضًا. انسخه الآن إن احتجت — يظهر الآن فقط. | public/assets/js/app/pages/admin/company-detail.js:603 |
| COF-93 | حقل | رابط تعيين كلمة المرور | public/assets/js/app/pages/admin/company-detail.js:604 |
| COF-94 | زر | نسخ | public/assets/js/app/pages/admin/company-detail.js:604 |
| COF-95 | عنصر قائمة | تم | public/assets/js/app/pages/admin/company-detail.js:606 |
| COF-96 | نافذة | رابط تعيين كلمة المرور | public/assets/js/app/pages/admin/company-detail.js:607 |
| COF-97 | زر | رابط تعيين كلمة مرور | public/assets/js/app/pages/admin/company-detail.js:623 |
| COF-98 | زر | إلغاء التحقق بخطوتين | public/assets/js/app/pages/admin/company-detail.js:624 |
| COF-99 | زر | فك القفل | public/assets/js/app/pages/admin/company-detail.js:625 |
| COF-100 | زر | تسجيل الخروج من كل الأجهزة | public/assets/js/app/pages/admin/company-detail.js:626 |
| COF-101 | عنصر قائمة | إغلاق | public/assets/js/app/pages/admin/company-detail.js:628 |
| COF-102 | نافذة | أمان حساب | public/assets/js/app/pages/admin/company-detail.js:629 |
| COF-103 | زر | إضافة كيان | public/assets/js/app/pages/admin/company-detail.js:648 |
| COF-104 | عنصر قائمة | الكيان | public/assets/js/app/pages/admin/company-detail.js:657 |
| COF-105 | عنصر قائمة | العلاقة | public/assets/js/app/pages/admin/company-detail.js:658 |
| COF-106 | عنصر قائمة | الشكل القانوني | public/assets/js/app/pages/admin/company-detail.js:659 |
| COF-107 | عنصر قائمة | السجل التجاري | public/assets/js/app/pages/admin/company-detail.js:660 |
| COF-108 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/company-detail.js:661 |
| COF-109 | زر | تعديل | public/assets/js/app/pages/admin/company-detail.js:662 |
| COF-110 | عنصر قائمة | إجراءات | public/assets/js/app/pages/admin/company-detail.js:662 |
| COF-111 | جدول | كيانات الشركة | public/assets/js/app/pages/admin/company-detail.js:664 |
| COF-112 | جدول | كيانات الشركة | public/assets/js/app/pages/admin/company-detail.js:665 |
| COF-113 | عنوان | الكيانات | public/assets/js/app/pages/admin/company-detail.js:667 |
| COF-114 | قسم/بطاقة | الكيانات | public/assets/js/app/pages/admin/company-detail.js:668 |
| COF-115 | زر | إضافة طرف | public/assets/js/app/pages/admin/company-detail.js:674 |
| COF-116 | عنصر قائمة | الطرف | public/assets/js/app/pages/admin/company-detail.js:682 |
| COF-117 | عنصر قائمة | النوع | public/assets/js/app/pages/admin/company-detail.js:683 |
| COF-118 | عنصر قائمة | المخاطر | public/assets/js/app/pages/admin/company-detail.js:694 |
| COF-119 | عنصر قائمة | في الذاكرة | public/assets/js/app/pages/admin/company-detail.js:696 |
| COF-120 | زر | تعديل | public/assets/js/app/pages/admin/company-detail.js:697 |
| COF-121 | عنصر قائمة | إجراءات | public/assets/js/app/pages/admin/company-detail.js:697 |
| COF-122 | جدول | الأطراف المتعاملة | public/assets/js/app/pages/admin/company-detail.js:699 |
| COF-123 | جدول | الأطراف المتعاملة | public/assets/js/app/pages/admin/company-detail.js:700 |
| COF-124 | عنوان | الأطراف المتعاملة | public/assets/js/app/pages/admin/company-detail.js:702 |
| COF-125 | قسم/بطاقة | الأطراف المتعاملة | public/assets/js/app/pages/admin/company-detail.js:703 |
| COF-126 | عنصر قائمة | الاسم القانوني | public/assets/js/app/pages/admin/company-detail.js:717 |
| COF-127 | عنصر قائمة | الشكل القانوني | public/assets/js/app/pages/admin/company-detail.js:718 |
| COF-128 | عنصر قائمة | العلاقة | public/assets/js/app/pages/admin/company-detail.js:719 |
| COF-129 | عنصر قائمة | تابع لـ | public/assets/js/app/pages/admin/company-detail.js:720 |
| COF-130 | عنصر قائمة | السجل التجاري | public/assets/js/app/pages/admin/company-detail.js:721 |
| COF-131 | عنصر قائمة | البطاقة الضريبية | public/assets/js/app/pages/admin/company-detail.js:722 |
| COF-132 | عنصر قائمة | جهة التسجيل | public/assets/js/app/pages/admin/company-detail.js:723 |
| COF-133 | عنصر قائمة | الكيان نشط | public/assets/js/app/pages/admin/company-detail.js:724 |
| COF-134 | عنصر قائمة | سبب تجاوز حد الباقة | public/assets/js/app/pages/admin/company-detail.js:725 |
| COF-135 | نافذة | إضافة كيان | public/assets/js/app/pages/admin/company-detail.js:742 |
| COF-136 | عنصر قائمة | الاسم | public/assets/js/app/pages/admin/company-detail.js:751 |
| COF-137 | عنصر قائمة | النوع | public/assets/js/app/pages/admin/company-detail.js:752 |
| COF-138 | عنصر قائمة | السجل التجاري | public/assets/js/app/pages/admin/company-detail.js:753 |
| COF-139 | عنصر قائمة | درجة المخاطر | public/assets/js/app/pages/admin/company-detail.js:754 |
| COF-140 | عنصر قائمة | ملاحظات داخلية | public/assets/js/app/pages/admin/company-detail.js:755 |
| COF-141 | عنصر قائمة | محظور التعامل | public/assets/js/app/pages/admin/company-detail.js:756 |
| COF-142 | نافذة | تعديل … | public/assets/js/app/pages/admin/company-detail.js:766 |
| COF-143 | زر | تغيير الباقة | public/assets/js/app/pages/admin/company-detail.js:781 |
| COF-144 | زر | بدء اشتراك | public/assets/js/app/pages/admin/company-detail.js:798 |
| COF-145 | حالة فارغة | لا اشتراك نشط لهذه الشركة. | public/assets/js/app/pages/admin/company-detail.js:798 |
| COF-146 | عنوان | الاشتراك | public/assets/js/app/pages/admin/company-detail.js:799 |
| COF-147 | قسم/بطاقة | الاشتراك | public/assets/js/app/pages/admin/company-detail.js:800 |
| COF-148 | عنصر قائمة | التاريخ | public/assets/js/app/pages/admin/company-detail.js:816 |
| COF-149 | عنصر قائمة | النوع | public/assets/js/app/pages/admin/company-detail.js:817 |
| COF-150 | عنصر قائمة | الوصف | public/assets/js/app/pages/admin/company-detail.js:818 |
| COF-151 | رابط | (نص متغير) | public/assets/js/app/pages/admin/company-detail.js:819 |
| COF-152 | عنصر قائمة | الطلب | public/assets/js/app/pages/admin/company-detail.js:819 |
| COF-153 | عنصر قائمة | المبلغ | public/assets/js/app/pages/admin/company-detail.js:820 |
| COF-154 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/company-detail.js:821 |
| COF-155 | زر | استبدال بمبلغ أقل | public/assets/js/app/pages/admin/company-detail.js:832 |
| COF-156 | زر | إلغاء | public/assets/js/app/pages/admin/company-detail.js:833 |
| COF-157 | عنصر قائمة | إجراءات | public/assets/js/app/pages/admin/company-detail.js:835 |
| COF-158 | جدول | التكاليف الإضافية | public/assets/js/app/pages/admin/company-detail.js:838 |
| COF-159 | جدول | التكاليف الإضافية | public/assets/js/app/pages/admin/company-detail.js:839 |
| COF-160 | حقل | الدورة | public/assets/js/app/pages/admin/company-detail.js:850 |
| COF-161 | زر | تصدير CSV | public/assets/js/app/pages/admin/company-detail.js:866 |
| COF-162 | زر | إضافة تكلفة | public/assets/js/app/pages/admin/company-detail.js:867 |
| COF-163 | عنوان | التكاليف الإضافية | public/assets/js/app/pages/admin/company-detail.js:870 |
| COF-164 | قسم/بطاقة | التكاليف الإضافية | public/assets/js/app/pages/admin/company-detail.js:871 |
| COF-165 | عنصر قائمة | النوع | public/assets/js/app/pages/admin/company-detail.js:881 |
| COF-166 | عنصر قائمة | الوصف | public/assets/js/app/pages/admin/company-detail.js:882 |
| COF-167 | عنصر قائمة | المبلغ | public/assets/js/app/pages/admin/company-detail.js:883 |
| COF-168 | عنصر قائمة | كود الطلب (اختياري) | public/assets/js/app/pages/admin/company-detail.js:884 |
| COF-169 | نافذة | استبدال بمبلغ أقل | public/assets/js/app/pages/admin/company-detail.js:899 |
| COF-170 | عنصر قائمة | سبب الإلغاء | public/assets/js/app/pages/admin/company-detail.js:907 |
| COF-171 | نافذة | إلغاء تكلفة | public/assets/js/app/pages/admin/company-detail.js:914 |
| COF-172 | عنوان | الاستخدام في الدورة | public/assets/js/app/pages/admin/company-detail.js:934 |
| COF-173 | قسم/بطاقة | الاستخدام في الدورة | public/assets/js/app/pages/admin/company-detail.js:935 |
| COF-174 | تنبيه | ينتهي الاشتراك الحالي اليوم ويبدأ الجديد بلقطة من الشروط أدناه؛ يبقى… | public/assets/js/app/pages/admin/company-detail.js:980 |
| COF-175 | عنوان | شروط الاشتراك | public/assets/js/app/pages/admin/company-detail.js:983 |
| COF-176 | عنصر قائمة | إلغاء | public/assets/js/app/pages/admin/company-detail.js:987 |
| COF-177 | تنبيه | (نص متغير) | public/assets/js/app/pages/admin/company-detail.js:1005 |
| COF-178 | عنصر قائمة | حفظ الاشتراك | public/assets/js/app/pages/admin/company-detail.js:1009 |
| COF-179 | نافذة | تغيير الباقة | public/assets/js/app/pages/admin/company-detail.js:1017 |
| COF-180 | تنبيه | … بانتظار مراجعة الفريق (حفظتها الشركة عند اعتماد تسليم). | public/assets/js/app/pages/admin/company-detail.js:1032 |
| COF-181 | عنصر قائمة | النوع | public/assets/js/app/pages/admin/company-detail.js:1042 |
| COF-182 | رابط | (نص متغير) | public/assets/js/app/pages/admin/company-detail.js:1046 |
| COF-183 | عنصر قائمة | العنصر | public/assets/js/app/pages/admin/company-detail.js:1047 |
| COF-184 | عنصر قائمة | الحالة | public/assets/js/app/pages/admin/company-detail.js:1053 |
| COF-185 | عنصر قائمة | أقرب موعد | public/assets/js/app/pages/admin/company-detail.js:1055 |
| COF-186 | عنصر قائمة | من يراه في الشركة | public/assets/js/app/pages/admin/company-detail.js:1056 |
| COF-187 | رابط | (نص متغير) | public/assets/js/app/pages/admin/company-detail.js:1057 |
| COF-188 | عنصر قائمة | من طلب | public/assets/js/app/pages/admin/company-detail.js:1057 |
| COF-189 | عنصر قائمة | مستندات | public/assets/js/app/pages/admin/company-detail.js:1058 |
| COF-190 | جدول | الذاكرة القانونية للشركة | public/assets/js/app/pages/admin/company-detail.js:1060 |
| COF-191 | جدول | الذاكرة القانونية للشركة | public/assets/js/app/pages/admin/company-detail.js:1061 |
| COF-192 | قسم/بطاقة | الذاكرة القانونية للشركة | public/assets/js/app/pages/admin/company-detail.js:1063 |
| COF-193 | حقل | (نص متغير) | public/assets/js/app/pages/admin/company-detail.js:1071 |
| COF-194 | حقل | النوع | public/assets/js/app/pages/admin/company-detail.js:1077 |
| COF-195 | حقل | بحث في الذاكرة | public/assets/js/app/pages/admin/company-detail.js:1078 |
| COF-196 | زر | إضافة عنصر | public/assets/js/app/pages/admin/company-detail.js:1081 |
| COF-197 | حقل | المحامي | public/assets/js/app/pages/admin/company-detail.js:1103 |
| COF-198 | حقل | الدور | public/assets/js/app/pages/admin/company-detail.js:1104 |
| COF-199 | حقل | ملاحظة | public/assets/js/app/pages/admin/company-detail.js:1105 |
| COF-200 | زر | حذف | public/assets/js/app/pages/admin/company-detail.js:1106 |
| COF-201 | حالة فارغة | لا محامين مفضلين أو مستبعدين لهذه الشركة. | public/assets/js/app/pages/admin/company-detail.js:1110 |
| COF-202 | زر | إضافة محامٍ | public/assets/js/app/pages/admin/company-detail.js:1122 |
| COF-203 | زر | حفظ الفريق | public/assets/js/app/pages/admin/company-detail.js:1132 |
| COF-204 | عنوان | الفريق المفضل | public/assets/js/app/pages/admin/company-detail.js:1135 |
| COF-205 | قسم/بطاقة | الفريق المفضل | public/assets/js/app/pages/admin/company-detail.js:1136 |
| COF-206 | عنصر قائمة | الوقت | public/assets/js/app/pages/admin/company-detail.js:1154 |
| COF-207 | عنصر قائمة | الحدث | public/assets/js/app/pages/admin/company-detail.js:1155 |
| COF-208 | عنصر قائمة | بواسطة | public/assets/js/app/pages/admin/company-detail.js:1156 |
| COF-209 | عنصر قائمة | التفاصيل | public/assets/js/app/pages/admin/company-detail.js:1157 |
| COF-210 | جدول | سجل الشركة | public/assets/js/app/pages/admin/company-detail.js:1159 |
| COF-211 | جدول | سجل الشركة | public/assets/js/app/pages/admin/company-detail.js:1160 |
| COF-212 | عنوان | السجل | public/assets/js/app/pages/admin/company-detail.js:1162 |
| COF-213 | قسم/بطاقة | السجل | public/assets/js/app/pages/admin/company-detail.js:1163 |
| COF-214 | خيار | (نص متغير) | public/assets/js/app/pages/admin/company-detail.js:1179 |
| COF-215 | حقل | الحالة | public/assets/js/app/pages/admin/company-detail.js:1236 |
| COF-216 | حقل | ملاحظات داخلية | public/assets/js/app/pages/admin/company-detail.js:1237 |
| COF-217 | حقل | إضافة مستندات | public/assets/js/app/pages/admin/company-detail.js:1239 |
| COF-218 | رابط | (نص متغير) | public/assets/js/app/pages/admin/company-detail.js:1248 |
| COF-219 | تنبيه | (نص متغير) | public/assets/js/app/pages/admin/company-detail.js:1271 |
| COF-220 | زر | استعادة من الأرشيف | public/assets/js/app/pages/admin/company-detail.js:1288 |
| COF-221 | زر | حذف نهائي | public/assets/js/app/pages/admin/company-detail.js:1289 |
| COF-222 | حقل | اكتب اسم العنصر للتأكيد | public/assets/js/app/pages/admin/company-detail.js:1293 |
| COF-223 | تنبيه | يُحذف العنصر ومستنداته غير المشتركة وتذكيراته وصلاحيات المحامين عليه.… | public/assets/js/app/pages/admin/company-detail.js:1300 |
| COF-224 | عنصر قائمة | إلغاء | public/assets/js/app/pages/admin/company-detail.js:1304 |
| COF-225 | عنصر قائمة | حذف نهائي | public/assets/js/app/pages/admin/company-detail.js:1326 |
| COF-226 | نافذة | حذف نهائي من الذاكرة | public/assets/js/app/pages/admin/company-detail.js:1329 |
| COF-227 | تنبيه | حفظت الشركة هذا العقد في ذاكرتها القانونية عند اعتماد التسليم. راجِع… | public/assets/js/app/pages/admin/company-detail.js:1343 |
| COF-228 | قسم/بطاقة | المستندات | public/assets/js/app/pages/admin/company-detail.js:1351 |
| COF-229 | عنوان | المستندات | public/assets/js/app/pages/admin/company-detail.js:1351 |
| COF-230 | رابط | (نص متغير) | public/assets/js/app/pages/admin/company-detail.js:1356 |
| COF-231 | عنصر قائمة | إلغاء | public/assets/js/app/pages/admin/company-detail.js:1365 |
| COF-232 | عنصر قائمة | حفظ وتأكيد | public/assets/js/app/pages/admin/company-detail.js:1367 |
| COF-233 | عنصر قائمة | حفظ | public/assets/js/app/pages/admin/company-detail.js:1368 |
| COF-234 | نافذة | مراجعة العقد في الذاكرة | public/assets/js/app/pages/admin/company-detail.js:1375 |
| COF-235 | حقل | ملاحظات داخلية | public/assets/js/app/pages/admin/company-detail.js:1388 |
| COF-236 | حقل | المستندات | public/assets/js/app/pages/admin/company-detail.js:1389 |
| COF-237 | حقل | النوع | public/assets/js/app/pages/admin/company-detail.js:1395 |
| COF-238 | عنصر قائمة | إلغاء | public/assets/js/app/pages/admin/company-detail.js:1414 |
| COF-239 | تنبيه | (نص متغير) | public/assets/js/app/pages/admin/company-detail.js:1430 |
| COF-240 | عنصر قائمة | إضافة | public/assets/js/app/pages/admin/company-detail.js:1434 |
| COF-241 | نافذة | إضافة عنصر إلى الذاكرة القانونية | public/assets/js/app/pages/admin/company-detail.js:1442 |
| COF-242 | عنصر قائمة | الباقة | public/assets/js/app/pages/admin/company-detail.js:951 |
| COF-243 | عنصر قائمة | يبدأ الاشتراك الجديد في | public/assets/js/app/pages/admin/company-detail.js:952 |
| COF-244 | عنصر قائمة | التجديد | public/assets/js/app/pages/admin/company-detail.js:963 |
| COF-245 | عنصر قائمة | ينتهي في (اختياري) | public/assets/js/app/pages/admin/company-detail.js:965 |
| COF-246 | عنصر قائمة | ملاحظة | public/assets/js/app/pages/admin/company-detail.js:966 |
| COF-247 | نموذج | الباقة | public/assets/js/app/pages/admin/company-detail.js:968 |
| COF-248 | عنصر قائمة | نظرة عامة | public/assets/js/app/pages/admin/company-detail.js:1169 |
| COF-249 | عنصر قائمة | الطلبات | public/assets/js/app/pages/admin/company-detail.js:1170 |
| COF-250 | عنصر قائمة | المستخدمون | public/assets/js/app/pages/admin/company-detail.js:1171 |
| COF-251 | عنصر قائمة | الكيانات والأطراف | public/assets/js/app/pages/admin/company-detail.js:1172 |
| COF-252 | عنصر قائمة | الباقة والتكاليف | public/assets/js/app/pages/admin/company-detail.js:1173 |
| COF-253 | عنصر قائمة | الذاكرة القانونية | public/assets/js/app/pages/admin/company-detail.js:1174 |
| COF-254 | عنصر قائمة | الفريق المفضل | public/assets/js/app/pages/admin/company-detail.js:1175 |
| COF-255 | عنصر قائمة | السجل | public/assets/js/app/pages/admin/company-detail.js:1176 |

## NTF: الإشعارات (`/app#/notifications`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| NTF-01 | زر | تحديد الكل كمقروء | public/assets/js/app/pages/notifications.js:28 |
| NTF-02 | زر | (نص متغير) | public/assets/js/app/pages/notifications.js:31 |
| NTF-03 | زر | (نص متغير) | public/assets/js/app/pages/notifications.js:32 |
| NTF-04 | زر | غير مقروء | public/assets/js/app/pages/notifications.js:61 |
| NTF-05 | زر | تحديد كمقروء | public/assets/js/app/pages/notifications.js:74 |
| NTF-06 | حالة فارغة | لا توجد إشعارات غير مقروءة | public/assets/js/app/pages/notifications.js:92 |
| NTF-07 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/notifications.js:107 |
| NTF-08 | عنوان | (نص متغير) | public/assets/js/app/pages/notifications.js:107 |
| NTF-09 | عنوان | الإشعارات | public/assets/js/app/pages/notifications.js:115 |
| NTF-10 | عنوان | الإشعارات | public/assets/js/app/pages/notifications.js:115 |
| NTF-11 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/notifications.js:118 |
| NTF-12 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/notifications.js:119 |

## PRF: حسابي والأمان (`/app#/account`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| PRF-01 | قسم/بطاقة | رموز العناصر | public/assets/js/app/pages/account.js:488 |
| PRF-02 | حقل | إظهار رموز العناصر على هذا الجهاز | public/assets/js/app/pages/account.js:491 |
| PRF-03 | زر | قائمة كل الرموز | public/assets/js/app/pages/account.js:493 |
| PRF-04 | عنوان | البيانات الشخصية | public/assets/js/app/pages/account.js:97 |
| PRF-05 | قسم/بطاقة | البيانات الشخصية | public/assets/js/app/pages/account.js:98 |
| PRF-06 | عنوان | كلمة المرور | public/assets/js/app/pages/account.js:134 |
| PRF-07 | قسم/بطاقة | كلمة المرور | public/assets/js/app/pages/account.js:135 |
| PRF-08 | تنبيه | حسابك بدور «إدارة النظام» ويطّلع على بيانات المستفيدين وهواتفهم؛ تفعي… | public/assets/js/app/pages/account.js:149 |
| PRF-09 | زر | تفعيل التحقق بخطوتين | public/assets/js/app/pages/account.js:154 |
| PRF-10 | تنبيه | اقتربت رموز الاسترداد من النفاد. أصدر رموزًا جديدة واحفظها في مكان آم… | public/assets/js/app/pages/account.js:166 |
| PRF-11 | زر | إصدار رموز استرداد جديدة | public/assets/js/app/pages/account.js:169 |
| PRF-12 | زر | إلغاء التحقق بخطوتين | public/assets/js/app/pages/account.js:170 |
| PRF-13 | نافذة | إصدار رموز استرداد جديدة | public/assets/js/app/pages/account.js:202 |
| PRF-14 | نافذة | رموز الاسترداد الجديدة | public/assets/js/app/pages/account.js:211 |
| PRF-15 | نافذة | إلغاء التحقق بخطوتين | public/assets/js/app/pages/account.js:222 |
| PRF-16 | عنوان | التحقق بخطوتين | public/assets/js/app/pages/account.js:230 |
| PRF-17 | قسم/بطاقة | التحقق بخطوتين | public/assets/js/app/pages/account.js:230 |
| PRF-18 | نافذة | إنهاء الجلسة | public/assets/js/app/pages/account.js:269 |
| PRF-19 | زر | إنهاء | public/assets/js/app/pages/account.js:274 |
| PRF-20 | حالة فارغة | لا توجد جلسات نشطة | public/assets/js/app/pages/account.js:278 |
| PRF-21 | نافذة | تسجيل الخروج من الأجهزة الأخرى | public/assets/js/app/pages/account.js:289 |
| PRF-22 | زر | تسجيل الخروج من كل الأجهزة الأخرى | public/assets/js/app/pages/account.js:295 |
| PRF-23 | عنوان | الأجهزة والجلسات النشطة | public/assets/js/app/pages/account.js:298 |
| PRF-24 | قسم/بطاقة | الأجهزة والجلسات النشطة | public/assets/js/app/pages/account.js:298 |
| PRF-25 | عنوان | آخر أحداث الأمان على حسابك | public/assets/js/app/pages/account.js:324 |
| PRF-26 | قسم/بطاقة | آخر أحداث الأمان على حسابك | public/assets/js/app/pages/account.js:324 |
| PRF-27 | حقل | (نص متغير) | public/assets/js/app/pages/account.js:330 |
| PRF-28 | حقل | (نص متغير) | public/assets/js/app/pages/account.js:331 |
| PRF-29 | زر | جرّب التنبيه | public/assets/js/app/pages/account.js:339 |
| PRF-30 | عنوان | التنبيهات | public/assets/js/app/pages/account.js:415 |
| PRF-31 | قسم/بطاقة | التنبيهات | public/assets/js/app/pages/account.js:416 |
| PRF-32 | حقل | (نص متغير) | public/assets/js/app/pages/account.js:435 |
| PRF-33 | عنوان | تنبيهات على هذا الجهاز | public/assets/js/app/pages/account.js:459 |
| PRF-34 | قسم/بطاقة | تنبيهات على هذا الجهاز | public/assets/js/app/pages/account.js:459 |
| PRF-35 | حقل | (نص متغير) | public/assets/js/app/pages/account.js:473 |
| PRF-36 | عنوان | رموز العناصر | public/assets/js/app/pages/account.js:495 |
| PRF-37 | عنوان | حسابي | public/assets/js/app/pages/account.js:510 |
| PRF-38 | تنبيه | نفدت رموز الاسترداد. أصدر رموزًا جديدة من بطاقة التحقق بخطوتين حتى لا… | public/assets/js/app/pages/account.js:511 |
| PRF-39 | زر | تسجيل الخروج | public/assets/js/app/pages/account.js:513 |
| PRF-40 | عنوان | حسابي والأمان | public/assets/js/app/pages/account.js:528 |
| PRF-41 | عنوان | حسابي والأمان | public/assets/js/app/pages/account.js:529 |
| PRF-42 | تنبيه | نفدت رموز الاسترداد. أصدر رموزًا جديدة من بطاقة التحقق بخطوتين حتى لا… | public/assets/js/app/pages/account.js:531 |
| PRF-43 | رابط | (نص متغير) | public/assets/js/app/components/two-factor.js:62 |
| PRF-44 | حقل | (نص متغير) | public/assets/js/app/components/two-factor.js:87 |
| PRF-45 | زر | (نص متغير) | public/assets/js/app/components/two-factor.js:88 |
| PRF-46 | تنبيه | (نص متغير) | public/assets/js/app/components/two-factor.js:92 |
| PRF-47 | زر | (نص متغير) | public/assets/js/app/components/two-factor.js:96 |
| PRF-48 | زر | (نص متغير) | public/assets/js/app/components/two-factor.js:97 |
| PRF-49 | تنبيه | (نص متغير) | public/assets/js/app/components/two-factor.js:185 |
| PRF-50 | عنوان | (نص متغير) | public/assets/js/app/components/two-factor.js:195 |
| PRF-51 | زر | (نص متغير) | public/assets/js/app/components/two-factor.js:196 |
| PRF-52 | زر | (نص متغير) | public/assets/js/app/components/two-factor.js:198 |
| PRF-53 | سؤال قابل للفتح | (نص متغير) | public/assets/js/app/components/two-factor.js:200 |
| PRF-54 | عنوان | (نص متغير) | public/assets/js/app/components/two-factor.js:200 |
| PRF-55 | سؤال قابل للفتح | اسم الحساب: … (… ) — النوع: حسب الوقت | public/assets/js/app/components/two-factor.js:217 |
| PRF-56 | عنوان | (نص متغير) | public/assets/js/app/components/two-factor.js:217 |
| PRF-57 | زر | نسخ المفتاح | public/assets/js/app/components/two-factor.js:220 |
| PRF-58 | زر | فتح في تطبيق المصادقة | public/assets/js/app/components/two-factor.js:220 |
| PRF-59 | تنبيه | (نص متغير) | public/assets/js/app/components/two-factor.js:234 |
| PRF-60 | زر | (نص متغير) | public/assets/js/app/components/two-factor.js:254 |
| PRF-61 | زر | (نص متغير) | public/assets/js/app/components/two-factor.js:255 |
| PRF-62 | عنصر قائمة | الاسم | public/assets/js/app/pages/account.js:51 |
| PRF-63 | عنصر قائمة | البريد الإلكتروني | public/assets/js/app/pages/account.js:52 |
| PRF-64 | عنصر قائمة | رقم الموبايل | public/assets/js/app/pages/account.js:53 |
| PRF-65 | زر | حفظ البيانات | public/assets/js/app/pages/account.js:76 |
| PRF-66 | نموذج | الاسم | public/assets/js/app/pages/account.js:77 |
| PRF-67 | عنصر قائمة | كلمة المرور الحالية | public/assets/js/app/pages/account.js:107 |
| PRF-68 | عنصر قائمة | كلمة المرور الجديدة | public/assets/js/app/pages/account.js:108 |
| PRF-69 | عنصر قائمة | تأكيد كلمة المرور الجديدة | public/assets/js/app/pages/account.js:109 |
| PRF-70 | زر | تغيير كلمة المرور | public/assets/js/app/pages/account.js:124 |
| PRF-71 | نموذج | كلمة المرور الحالية | public/assets/js/app/pages/account.js:125 |
| PRF-72 | عنصر قائمة | password | public/assets/js/app/components/two-factor.js:131 |
| PRF-73 | زر | حفظ | public/assets/js/app/components/two-factor.js:138 |
| PRF-74 | نموذج | (نص متغير) | public/assets/js/app/components/two-factor.js:139 |
| PRF-75 | نموذج | (نص متغير) | public/assets/js/app/components/two-factor.js:140 |
| PRF-76 | عنصر قائمة | code | public/assets/js/app/components/two-factor.js:158 |
| PRF-77 | زر | حفظ | public/assets/js/app/components/two-factor.js:171 |
| PRF-78 | نموذج | (نص متغير) | public/assets/js/app/components/two-factor.js:172 |
| PRF-79 | نموذج | (نص متغير) | public/assets/js/app/components/two-factor.js:173 |
| PRF-80 | عنصر قائمة | كلمة المرور الحالية | public/assets/js/app/pages/account.js:191 |
| PRF-81 | عنصر قائمة | رمز التحقق من التطبيق أو رمز استرداد | public/assets/js/app/pages/account.js:192 |

## TGS: رموز العناصر (`/app#/tags`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| TGS-01 | عنوان | رموز العناصر | public/assets/js/app/pages/admin/tags.js:204 |
| TGS-02 | حقل | ابحث في الرموز | public/assets/js/app/pages/admin/tags.js:213 |
| TGS-03 | قسم/بطاقة | السطح | public/assets/js/app/pages/admin/tags.js:131 |
| TGS-04 | زر | الكل | public/assets/js/app/pages/admin/tags.js:191 |
| TGS-05 | حقل | إظهار رموز العناصر على هذا الجهاز | public/assets/js/app/pages/admin/tags.js:220 |
| TGS-06 | نص | (نص متغير) | public/assets/js/app/pages/admin/tags.js:130 |
| TGS-07 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/tags.js:169 |
| TGS-08 | قسم/بطاقة | يُعدَّل من الإعدادات ← … | public/assets/js/app/pages/admin/tags.js:100 |
| TGS-09 | زر | (نص متغير) | public/assets/js/app/pages/admin/tags.js:101 |
| TGS-10 | سؤال قابل للفتح | النص كاملًا (… ) | public/assets/js/app/pages/admin/tags.js:114 |
| TGS-11 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/admin/tags.js:116 |
| TGS-12 | حالة فارغة | لا يوجد رمز أو نص يطابق «… » | public/assets/js/app/pages/admin/tags.js:153 |
| TGS-13 | عنوان | النص كاملًا (… ) | public/assets/js/app/pages/admin/tags.js:115 |
| TGS-14 | حقل | (نص متغير) | public/assets/js/app/pages/admin/tags.js:133 |
| TGS-15 | عنوان | (نص متغير) | public/assets/js/app/pages/admin/tags.js:170 |
| TGS-16 | عنوان | رموز العناصر | public/assets/js/app/pages/admin/tags.js:205 |

## RSH: طلب المحامي: معلومة أو مستند أو مساعدة (يظهر في: نافذة طلب المحامي في صفحة الإسناد)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| RSH-01 | نافذة | ماذا تحتاج؟ | public/assets/js/app/components/request-sheet.js:90 |
| RSH-02 | قسم/بطاقة | مطلوب بالفعل من المستفيد/ة: | public/assets/js/app/components/request-sheet.js:131 |
| RSH-03 | عنوان | مطلوب بالفعل من المستفيد/ة: | public/assets/js/app/components/request-sheet.js:131 |
| RSH-04 | زر | أحتاج هذا أيضًا | public/assets/js/app/components/request-sheet.js:142 |
| RSH-05 | زر | أحتاج هذا أيضًا | public/assets/js/app/components/request-sheet.js:180 |
| RSH-06 | زر | رجوع | public/assets/js/app/components/request-sheet.js:193 |
| RSH-07 | زر | (نص متغير) | public/assets/js/app/components/request-sheet.js:207 |
| RSH-08 | زر | مساعدة محامٍ آخر | public/assets/js/app/components/request-sheet.js:223 |
| RSH-09 | حقل | شهادة وفاة الزوج عقد الشقة إن وُجد | public/assets/js/app/components/request-sheet.js:240 |
| RSH-10 | زر | (نص متغير) | public/assets/js/app/components/request-sheet.js:291 |
| RSH-11 | حقل | (نص متغير) | public/assets/js/app/components/request-sheet.js:303 |
| RSH-12 | زر | + سبب الطلب (للإدارة فقط، اختياري) | public/assets/js/app/components/request-sheet.js:314 |
| RSH-13 | زر | أرسل للإدارة | public/assets/js/app/components/request-sheet.js:335 |
| RSH-14 | حقل | مثال: هل للمتوفى أبناء من زواج آخر؟ | public/assets/js/app/components/request-sheet.js:366 |
| RSH-15 | زر | أرسل للإدارة | public/assets/js/app/components/request-sheet.js:385 |
| RSH-16 | حقل | (نص متغير) | public/assets/js/app/components/request-sheet.js:403 |
| RSH-17 | زر | (نص متغير) | public/assets/js/app/components/request-sheet.js:425 |
| RSH-18 | حقل | (نص متغير) | public/assets/js/app/components/request-sheet.js:430 |
| RSH-19 | زر | + ملاحظة | public/assets/js/app/components/request-sheet.js:436 |
| RSH-20 | زر | اطلب المهلة | public/assets/js/app/components/request-sheet.js:449 |
| RSH-21 | حقل | (نص متغير) | public/assets/js/app/components/request-sheet.js:465 |
| RSH-22 | زر | أرسل للإدارة | public/assets/js/app/components/request-sheet.js:479 |

## DRF: المسودات والمقارنة (يظهر في: المسودات في صفحة الإسناد للمحامي)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| DRF-01 | عنصر قائمة | ارجع واحفظ | public/assets/js/app/components/draft-store.js:285 |
| DRF-02 | عنصر قائمة | سجّل الخروج | public/assets/js/app/components/draft-store.js:286 |
| DRF-03 | نافذة | نص لم يُحفظ بعد | public/assets/js/app/components/draft-store.js:293 |

## TDY: اليوم (المحامي) (`/app#/my`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| TDY-01 | عنوان | (نص متغير) | public/assets/js/app/pages/lawyer/home.js:101 |
| TDY-02 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/lawyer/home.js:105 |
| TDY-03 | زر | إعادة المحاولة | public/assets/js/app/pages/lawyer/home.js:137 |
| TDY-04 | قسم/بطاقة | تعذر تحميل مهامك. تحقق من الاتصال ثم أعد المحاولة. | public/assets/js/app/pages/lawyer/home.js:146 |
| TDY-05 | زر | إعادة المحاولة | public/assets/js/app/pages/lawyer/home.js:147 |
| TDY-06 | قسم/بطاقة | مطلوب الآن | public/assets/js/app/pages/lawyer/home.js:187 |
| TDY-07 | عنوان | مطلوب الآن | public/assets/js/app/pages/lawyer/home.js:188 |
| TDY-08 | زر | عرض … أخرى | public/assets/js/app/pages/lawyer/home.js:192 |
| TDY-09 | زر | (نص متغير) | public/assets/js/app/pages/lawyer/home.js:230 |
| TDY-10 | زر | (نص متغير) | public/assets/js/app/pages/lawyer/home.js:231 |
| TDY-11 | زر | (نص متغير) | public/assets/js/app/pages/lawyer/home.js:232 |
| TDY-12 | زر | تراجع | public/assets/js/app/pages/lawyer/home.js:292 |
| TDY-13 | زر | فعّل التنبيهات | public/assets/js/app/pages/lawyer/home.js:347 |
| TDY-14 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/lawyer/home.js:349 |
| TDY-15 | قسم/بطاقة | قادم | public/assets/js/app/pages/lawyer/home.js:357 |
| TDY-16 | عنوان | قادم | public/assets/js/app/pages/lawyer/home.js:357 |
| TDY-17 | رابط | (نص متغير) | public/assets/js/app/pages/lawyer/home.js:377 |
| TDY-18 | رابط | (نص متغير) | public/assets/js/app/pages/lawyer/home.js:389 |
| TDY-19 | رابط | (نص متغير) | public/assets/js/app/pages/lawyer/home.js:392 |
| TDY-20 | قسم/بطاقة | عملي الجاري | public/assets/js/app/pages/lawyer/home.js:397 |
| TDY-21 | عنوان | عملي الجاري | public/assets/js/app/pages/lawyer/home.js:397 |
| TDY-22 | رابط | الإسنادات السابقة › | public/assets/js/app/pages/lawyer/home.js:399 |
| TDY-23 | رابط | (نص متغير) | public/assets/js/app/pages/lawyer/home.js:409 |
| TDY-24 | قسم/بطاقة | أهلًا … — جهّز هاتفك في دقيقة | public/assets/js/app/pages/lawyer/home.js:432 |
| TDY-25 | عنوان | أهلًا … — جهّز هاتفك في دقيقة | public/assets/js/app/pages/lawyer/home.js:433 |
| TDY-26 | زر | (نص متغير) | public/assets/js/app/pages/lawyer/home.js:442 |
| TDY-27 | عنوان | كيف تعمل المنصة؟ | public/assets/js/app/pages/lawyer/home.js:448 |
| TDY-28 | زر | تم | public/assets/js/app/pages/lawyer/home.js:455 |
| TDY-29 | زر | لاحقًا | public/assets/js/app/pages/lawyer/home.js:455 |
| TDY-30 | زر | جرّب التنبيه | public/assets/js/app/pages/lawyer/home.js:472 |
| TDY-31 | حقل | (نص متغير) | public/assets/js/app/pages/lawyer/home.js:487 |
| TDY-32 | زر | فعّل التنبيهات | public/assets/js/app/pages/lawyer/home.js:489 |
| TDY-33 | عنصر قائمة | حسنًا | public/assets/js/app/pages/lawyer/home.js:542 |
| TDY-34 | نافذة | أضف المنصة إلى شاشتك الرئيسية | public/assets/js/app/pages/lawyer/home.js:543 |
| TDY-35 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/lawyer/home.js:580 |
| TDY-36 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/lawyer/home.js:222 |
| TDY-37 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/lawyer/home.js:222 |

## ASL: إسناداتي (`/app#/my/assignments`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| ASL-01 | رابط | (نص متغير) | public/assets/js/app/pages/lawyer/assignments.js:47 |
| ASL-02 | حالة فارغة | لا توجد إسنادات سابقة بعد. تظهر هنا الإسنادات التي اعتمدتها الإدارة أ… | public/assets/js/app/pages/lawyer/assignments.js:59 |
| ASL-03 | جدول | الإسنادات السابقة | public/assets/js/app/pages/lawyer/assignments.js:72 |
| ASL-04 | جدول | الإسنادات السابقة | public/assets/js/app/pages/lawyer/assignments.js:72 |
| ASL-05 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/lawyer/assignments.js:82 |
| ASL-06 | زر | طلبات الشركات | public/assets/js/app/pages/lawyer/assignments.js:93 |
| ASL-07 | عنصر قائمة | الحالية | public/assets/js/app/pages/lawyer/assignments.js:99 |
| ASL-08 | عنصر قائمة | السابقة | public/assets/js/app/pages/lawyer/assignments.js:110 |
| ASL-09 | خيار | الحالية | public/assets/js/app/pages/lawyer/assignments.js:113 |
| ASL-10 | عنوان | إسناداتي | public/assets/js/app/pages/lawyer/assignments.js:116 |
| ASL-11 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/lawyer/assignments.js:116 |

## ASG: صفحة الإسناد (`/app#/my/assignments/`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| ASG-01 | سؤال قابل للفتح | آخر موعد للإخطار: … | public/assets/js/app/pages/lawyer/assignment.js:80 |
| ASG-02 | عنوان | (نص متغير) | public/assets/js/app/pages/lawyer/assignment.js:80 |
| ASG-03 | قسم/بطاقة | سياق الشركة | public/assets/js/app/pages/lawyer/assignment.js:92 |
| ASG-04 | عنوان | سياق الشركة | public/assets/js/app/pages/lawyer/assignment.js:92 |
| ASG-05 | عنوان | من ذاكرة الشركة (… ) | public/assets/js/app/pages/lawyer/assignment.js:102 |
| ASG-06 | عنوان | الإسناد | public/assets/js/app/pages/lawyer/assignment.js:220 |
| ASG-07 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/lawyer/assignment.js:250 |
| ASG-08 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/lawyer/assignment.js:251 |
| ASG-09 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/lawyer/assignment.js:252 |
| ASG-10 | زر | اطلب مهلة | public/assets/js/app/pages/lawyer/assignment.js:309 |
| ASG-11 | قائمة روابط | مسار التنقل | public/assets/js/app/pages/lawyer/assignment.js:334 |
| ASG-12 | رابط | إسناداتي | public/assets/js/app/pages/lawyer/assignment.js:334 |
| ASG-13 | عنوان | (نص متغير) | public/assets/js/app/pages/lawyer/assignment.js:335 |
| ASG-14 | زر | ابدأ التعديل | public/assets/js/app/pages/lawyer/assignment.js:343 |
| ASG-15 | زر | … جديد | public/assets/js/app/pages/lawyer/assignment.js:377 |
| ASG-16 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/lawyer/assignment.js:406 |
| ASG-17 | عنوان | (نص متغير) | public/assets/js/app/pages/lawyer/assignment.js:406 |
| ASG-18 | قسم/بطاقة | المطلوب منك | public/assets/js/app/pages/lawyer/assignment.js:414 |
| ASG-19 | عنوان | المطلوب منك | public/assets/js/app/pages/lawyer/assignment.js:414 |
| ASG-20 | قسم/بطاقة | الوقائع | public/assets/js/app/pages/lawyer/assignment.js:426 |
| ASG-21 | قسم/بطاقة | الوقائع | public/assets/js/app/pages/lawyer/assignment.js:427 |
| ASG-22 | زر | اقرأ الباقي | public/assets/js/app/pages/lawyer/assignment.js:430 |
| ASG-23 | قسم/بطاقة | الوقائع | public/assets/js/app/pages/lawyer/assignment.js:443 |
| ASG-24 | زر | اقترح مسألة | public/assets/js/app/pages/lawyer/assignment.js:449 |
| ASG-25 | قسم/بطاقة | المسائل | public/assets/js/app/pages/lawyer/assignment.js:450 |
| ASG-26 | قسم/بطاقة | المسائل | public/assets/js/app/pages/lawyer/assignment.js:451 |
| ASG-27 | عنصر قائمة | عنوان المسألة | public/assets/js/app/pages/lawyer/assignment.js:482 |
| ASG-28 | عنصر قائمة | لماذا تقترحها؟ (اختياري) | public/assets/js/app/pages/lawyer/assignment.js:483 |
| ASG-29 | نافذة | اقتراح مسألة | public/assets/js/app/pages/lawyer/assignment.js:486 |
| ASG-30 | قسم/بطاقة | المستندات (… ) | public/assets/js/app/pages/lawyer/assignment.js:509 |
| ASG-31 | قسم/بطاقة | آراء الزملاء (… ) | public/assets/js/app/pages/lawyer/assignment.js:520 |
| ASG-32 | عنوان | (نص متغير) | public/assets/js/app/pages/lawyer/assignment.js:526 |
| ASG-33 | سؤال قابل للفتح | المطلوب منه: | public/assets/js/app/pages/lawyer/assignment.js:529 |
| ASG-34 | عنوان | رأيي · الإصدار … | public/assets/js/app/pages/lawyer/assignment.js:575 |
| ASG-35 | زر | أكمل الكتابة | public/assets/js/app/pages/lawyer/assignment.js:579 |
| ASG-36 | عنوان | (نص متغير) | public/assets/js/app/pages/lawyer/assignment.js:588 |
| ASG-37 | سؤال قابل للفتح | الإصدارات السابقة (… ) | public/assets/js/app/pages/lawyer/assignment.js:605 |
| ASG-38 | عنوان | الإصدارات السابقة (… ) | public/assets/js/app/pages/lawyer/assignment.js:605 |
| ASG-39 | سؤال قابل للفتح | ملاحظات الإدارة: | public/assets/js/app/pages/lawyer/assignment.js:611 |
| ASG-40 | عنوان | (نص متغير) | public/assets/js/app/pages/lawyer/assignment.js:611 |
| ASG-41 | حقل | إرفاق ملف عمل | public/assets/js/app/pages/lawyer/assignment.js:628 |
| ASG-42 | نافذة | حذف ملف العمل | public/assets/js/app/pages/lawyer/assignment.js:643 |
| ASG-43 | قسم/بطاقة | ملفات العمل (… ) | public/assets/js/app/pages/lawyer/assignment.js:651 |
| ASG-44 | عنوان | ملفات العمل (… ) | public/assets/js/app/pages/lawyer/assignment.js:651 |
| ASG-45 | زر | حذف … | public/assets/js/app/pages/lawyer/assignment.js:659 |
| ASG-46 | نافذة | حذف النص من هذا الجهاز؟ | public/assets/js/app/pages/lawyer/assignment.js:680 |
| ASG-47 | زر | انسخ النص | public/assets/js/app/pages/lawyer/assignment.js:690 |
| ASG-48 | زر | احذفه من الجهاز | public/assets/js/app/pages/lawyer/assignment.js:691 |
| ASG-49 | نافذة | إلغاء الطلب | public/assets/js/app/pages/lawyer/assignment.js:704 |
| ASG-50 | زر | إلغاء الطلب | public/assets/js/app/pages/lawyer/assignment.js:711 |
| ASG-51 | نافذة | إلغاء طلب المساعدة | public/assets/js/app/pages/lawyer/assignment.js:785 |
| ASG-52 | زر | إلغاء طلب المساعدة | public/assets/js/app/pages/lawyer/assignment.js:791 |
| ASG-53 | زر | أحتاج هذا أيضًا | public/assets/js/app/pages/lawyer/assignment.js:827 |
| ASG-54 | زر | اطلب | public/assets/js/app/pages/lawyer/assignment.js:844 |
| ASG-55 | قسم/بطاقة | طلباتك | public/assets/js/app/pages/lawyer/assignment.js:846 |
| ASG-56 | قسم/بطاقة | مطلوب بالفعل من الشركة | public/assets/js/app/pages/lawyer/assignment.js:847 |
| ASG-57 | قسم/بطاقة | ردود متاحة لك | public/assets/js/app/pages/lawyer/assignment.js:848 |
| ASG-58 | حقل | (نص متغير) | public/assets/js/app/pages/lawyer/assignment.js:874 |
| ASG-59 | حقل | نوع المساعدة المطلوبة | public/assets/js/app/pages/lawyer/assignment.js:881 |
| ASG-60 | حقل | — اختر التخصص — | public/assets/js/app/pages/lawyer/assignment.js:882 |
| ASG-61 | حقل | التخصص المطلوب | public/assets/js/app/pages/lawyer/assignment.js:883 |
| ASG-62 | حقل | (نص متغير) | public/assets/js/app/pages/lawyer/assignment.js:886 |
| ASG-63 | حقل | المسائل التي يتعلق بها الطلب | public/assets/js/app/pages/lawyer/assignment.js:889 |
| ASG-64 | حقل | (نص متغير) | public/assets/js/app/pages/lawyer/assignment.js:892 |
| ASG-65 | حقل | المستندات ذات الصلة | public/assets/js/app/pages/lawyer/assignment.js:895 |
| ASG-66 | حقل | مثال: أطلب رأيًا متخصصًا في الأثر الضريبي لانتقال الشقة بالميراث ثم ب… | public/assets/js/app/pages/lawyer/assignment.js:896 |
| ASG-67 | حقل | وصف المطلوب | public/assets/js/app/pages/lawyer/assignment.js:897 |
| ASG-68 | نموذج | (نص متغير) | public/assets/js/app/pages/lawyer/assignment.js:929 |
| ASG-69 | عنصر قائمة | إلغاء | public/assets/js/app/pages/lawyer/assignment.js:931 |
| ASG-70 | عنصر قائمة | أرسل للإدارة | public/assets/js/app/pages/lawyer/assignment.js:956 |
| ASG-71 | نافذة | مساعدة محامٍ آخر | public/assets/js/app/pages/lawyer/assignment.js:959 |
| ASG-72 | زر | (نص متغير) | public/assets/js/app/pages/lawyer/assignment.js:971 |
| ASG-73 | زر | اطلب | public/assets/js/app/pages/lawyer/assignment.js:973 |

## WRT: وضع الكتابة «رأيي» (`/app#/my/assignments/`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| WRT-01 | حقل | (نص متغير) | public/assets/js/app/pages/lawyer/write.js:86 |
| WRT-02 | زر | (نص متغير) | public/assets/js/app/pages/lawyer/write.js:175 |
| WRT-03 | حقل | اكتب رأيك هنا… | public/assets/js/app/pages/lawyer/write.js:233 |
| WRT-04 | حقل | خطوة في كل سطر | public/assets/js/app/pages/lawyer/write.js:238 |
| WRT-05 | سؤال قابل للفتح | … (اختياري، حتى … ) | public/assets/js/app/pages/lawyer/write.js:244 |
| WRT-06 | عنوان | … (اختياري، حتى … ) | public/assets/js/app/pages/lawyer/write.js:244 |
| WRT-07 | رابط | الملف | public/assets/js/app/pages/lawyer/write.js:309 |
| WRT-08 | عنوان | (نص متغير) | public/assets/js/app/pages/lawyer/write.js:313 |
| WRT-09 | حقل | عولجت الملاحظة … | public/assets/js/app/pages/lawyer/write.js:321 |
| WRT-10 | زر | (نص متغير) | public/assets/js/app/pages/lawyer/write.js:342 |
| WRT-11 | قسم/بطاقة | المطلوب منك | public/assets/js/app/pages/lawyer/write.js:365 |
| WRT-12 | عنوان | المطلوب منك | public/assets/js/app/pages/lawyer/write.js:365 |
| WRT-13 | قسم/بطاقة | المسائل | public/assets/js/app/pages/lawyer/write.js:368 |
| WRT-14 | عنوان | المسائل | public/assets/js/app/pages/lawyer/write.js:368 |
| WRT-15 | سؤال قابل للفتح | لم يُقدَّم بعد | public/assets/js/app/pages/lawyer/write.js:395 |
| WRT-16 | عنوان | لم يُقدَّم بعد | public/assets/js/app/pages/lawyer/write.js:395 |
| WRT-17 | زر | اعرض الحالات المشابهة | public/assets/js/app/pages/lawyer/write.js:433 |
| WRT-18 | زر | (نص متغير) | public/assets/js/app/pages/lawyer/write.js:455 |
| WRT-19 | قسم/بطاقة | المستندات | public/assets/js/app/pages/lawyer/write.js:471 |
| WRT-20 | عنوان | المستندات | public/assets/js/app/pages/lawyer/write.js:471 |
| WRT-21 | نافذة | المطلوب والمسائل | public/assets/js/app/pages/lawyer/write.js:482 |
| WRT-22 | عنصر قائمة | رجوع للكتابة | public/assets/js/app/pages/lawyer/write.js:522 |
| WRT-23 | نافذة | رجوع للكتابة | public/assets/js/app/pages/lawyer/write.js:524 |
| WRT-24 | عنصر قائمة | إلغاء | public/assets/js/app/pages/lawyer/write.js:547 |
| WRT-25 | عنصر قائمة | أضفها في النهاية | public/assets/js/app/pages/lawyer/write.js:548 |
| WRT-26 | عنصر قائمة | استبدل نصي | public/assets/js/app/pages/lawyer/write.js:549 |
| WRT-27 | نافذة | مسودة أولية آلية | public/assets/js/app/pages/lawyer/write.js:556 |
| WRT-28 | نافذة | حالات مشابهة اعتمدتها المؤسسة | public/assets/js/app/pages/lawyer/write.js:567 |
| WRT-29 | زر | (نص متغير) | public/assets/js/app/pages/lawyer/write.js:576 |
| WRT-30 | نافذة | أدوات الكتابة | public/assets/js/app/pages/lawyer/write.js:591 |
| WRT-31 | زر | المطلوب والمسائل | public/assets/js/app/pages/lawyer/write.js:599 |
| WRT-32 | زر | هيكل الرأي | public/assets/js/app/pages/lawyer/write.js:604 |
| WRT-33 | زر | أدوات أخرى | public/assets/js/app/pages/lawyer/write.js:605 |
| WRT-34 | زر | تقديم | public/assets/js/app/pages/lawyer/write.js:606 |
| WRT-35 | زر | استخدم نص هذا الجهاز | public/assets/js/app/pages/lawyer/write.js:684 |
| WRT-36 | زر | استخدم نص المنصة | public/assets/js/app/pages/lawyer/write.js:697 |
| WRT-37 | زر | نُسخ نص المنصة؛ يمكنك لصقه حيث تريد. | public/assets/js/app/pages/lawyer/write.js:707 |
| WRT-38 | زر | انسخ نصك | public/assets/js/app/pages/lawyer/write.js:747 |
| WRT-39 | زر | افتح الملف | public/assets/js/app/pages/lawyer/write.js:748 |
| WRT-40 | حقل | (نص متغير) | public/assets/js/app/pages/lawyer/write.js:775 |
| WRT-41 | زر | + عدد الساعات (اختياري) | public/assets/js/app/pages/lawyer/write.js:777 |
| WRT-42 | عنصر قائمة | ليس الآن | public/assets/js/app/pages/lawyer/write.js:791 |
| WRT-43 | عنصر قائمة | قدّم الآن | public/assets/js/app/pages/lawyer/write.js:841 |
| WRT-44 | نافذة | تقديم الرأي للإدارة؟ | public/assets/js/app/pages/lawyer/write.js:844 |

## LMT: ملفاتي المستمرة (`/app#/my/matters`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| LMT-01 | رابط | فتح الملف المستمر … : … | public/assets/js/app/pages/lawyer/matters.js:50 |
| LMT-02 | عنوان | الملفات المستمرة | public/assets/js/app/pages/lawyer/matters.js:74 |
| LMT-03 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/lawyer/matters.js:74 |
| LMT-04 | قسم/بطاقة | الملفات المستمرة | public/assets/js/app/pages/lawyer/matters.js:82 |
| LMT-05 | عنوان | الملفات المستمرة | public/assets/js/app/pages/lawyer/matters.js:82 |
| LMT-06 | حالة فارغة | لا توجد ملفات مستمرة مسندة إليك | public/assets/js/app/pages/lawyer/matters.js:89 |
| LMT-07 | قسم/بطاقة | عندما تسند إليك الإدارة تمثيلًا أمام القضاء أو عملًا قانونيًا مستمرًا… | public/assets/js/app/pages/lawyer/matters.js:90 |
| LMT-08 | حالة فارغة | لا توجد ملفات جارية حاليًا. | public/assets/js/app/pages/lawyer/matters.js:99 |
| LMT-09 | قسم/بطاقة | لا توجد ملفات جارية حاليًا. | public/assets/js/app/pages/lawyer/matters.js:99 |
| LMT-10 | سؤال قابل للفتح | ملفات منتهية (… ) | public/assets/js/app/pages/lawyer/matters.js:101 |
| LMT-11 | عنوان | ملفات منتهية (… ) | public/assets/js/app/pages/lawyer/matters.js:101 |

## LMF: ملف مستمر (المحامي) (`/app#/my/matters/`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| LMF-01 | عنوان | ملف مستمر | public/assets/js/app/pages/lawyer/matter.js:58 |
| LMF-02 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/lawyer/matter.js:58 |
| LMF-03 | قسم/بطاقة | إضافة جلسة | public/assets/js/app/pages/lawyer/matter.js:123 |
| LMF-04 | عنوان | (نص متغير) | public/assets/js/app/pages/lawyer/matter.js:124 |
| LMF-05 | زر | إضافة جلسة | public/assets/js/app/pages/lawyer/matter.js:130 |
| LMF-06 | زر | إضافة مهمة | public/assets/js/app/pages/lawyer/matter.js:131 |
| LMF-07 | قسم/بطاقة | بلا نتيجة | public/assets/js/app/pages/lawyer/matter.js:145 |
| LMF-08 | عنوان | بلا نتيجة | public/assets/js/app/pages/lawyer/matter.js:148 |
| LMF-09 | زر | سجّل النتيجة | public/assets/js/app/pages/lawyer/matter.js:152 |
| LMF-10 | زر | افتح | public/assets/js/app/pages/lawyer/matter.js:181 |
| LMF-11 | زر | سجّل النتيجة | public/assets/js/app/pages/lawyer/matter.js:192 |
| LMF-12 | زر | خيارات … | public/assets/js/app/pages/lawyer/matter.js:194 |
| LMF-13 | زر | تعديل النتيجة | public/assets/js/app/pages/lawyer/matter.js:196 |
| LMF-14 | زر | تعديل النتيجة | public/assets/js/app/pages/lawyer/matter.js:198 |
| LMF-15 | زر | تمّ الموعد | public/assets/js/app/pages/lawyer/matter.js:200 |
| LMF-16 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/lawyer/matter.js:229 |
| LMF-17 | عنوان | (نص متغير) | public/assets/js/app/pages/lawyer/matter.js:229 |
| LMF-18 | زر | عرض الكل (… ) | public/assets/js/app/pages/lawyer/matter.js:239 |
| LMF-19 | زر | إضافة جلسة | public/assets/js/app/pages/lawyer/matter.js:249 |
| LMF-20 | حالة فارغة | لم تُسجَّل جلسات في هذا الملف بعد. | public/assets/js/app/pages/lawyer/matter.js:249 |
| LMF-21 | عنوان | الجلسات | public/assets/js/app/pages/lawyer/matter.js:250 |
| LMF-22 | قسم/بطاقة | الجلسات | public/assets/js/app/pages/lawyer/matter.js:250 |
| LMF-23 | زر | تعديل الموعد | public/assets/js/app/pages/lawyer/matter.js:261 |
| LMF-24 | زر | أُلغيت الجلسة | public/assets/js/app/pages/lawyer/matter.js:264 |
| LMF-25 | نافذة | الجلسة | public/assets/js/app/pages/lawyer/matter.js:269 |
| LMF-26 | نافذة | أُلغيت الجلسة؟ | public/assets/js/app/pages/lawyer/matter.js:285 |
| LMF-27 | زر | إعادة فتح | public/assets/js/app/pages/lawyer/matter.js:333 |
| LMF-28 | زر | تمّت | public/assets/js/app/pages/lawyer/matter.js:334 |
| LMF-29 | زر | افتح | public/assets/js/app/pages/lawyer/matter.js:354 |
| LMF-30 | حالة فارغة | لا توجد مهام في هذا الملف. | public/assets/js/app/pages/lawyer/matter.js:368 |
| LMF-31 | عنوان | المهام | public/assets/js/app/pages/lawyer/matter.js:369 |
| LMF-32 | قسم/بطاقة | المهام | public/assets/js/app/pages/lawyer/matter.js:370 |
| LMF-33 | حقل | مثال: تقديم مذكرة بالدفاع قبل الجلسة | public/assets/js/app/pages/lawyer/matter.js:379 |
| LMF-34 | حقل | (نص متغير) | public/assets/js/app/pages/lawyer/matter.js:382 |
| LMF-35 | حقل | (نص متغير) | public/assets/js/app/pages/lawyer/matter.js:389 |
| LMF-36 | زر | إضافة المهمة | public/assets/js/app/pages/lawyer/matter.js:391 |
| LMF-37 | حقل | (نص متغير) | public/assets/js/app/pages/lawyer/matter.js:399 |
| LMF-38 | زر | تفاصيل | public/assets/js/app/pages/lawyer/matter.js:403 |
| LMF-39 | نافذة | تجاهل ما أدخلته؟ | public/assets/js/app/pages/lawyer/matter.js:444 |
| LMF-40 | نافذة | إضافة مهمة | public/assets/js/app/pages/lawyer/matter.js:452 |
| LMF-41 | حالة فارغة | لا توجد مستندات في هذا الملف. تضيف الإدارة مستندات الدعوى عند استلامه… | public/assets/js/app/pages/lawyer/matter.js:466 |
| LMF-42 | عنوان | المستندات | public/assets/js/app/pages/lawyer/matter.js:467 |
| LMF-43 | قسم/بطاقة | المستندات | public/assets/js/app/pages/lawyer/matter.js:468 |
| LMF-44 | سؤال قابل للفتح | بيانات الدعوى | public/assets/js/app/pages/lawyer/matter.js:481 |
| LMF-45 | عنوان | بيانات الدعوى | public/assets/js/app/pages/lawyer/matter.js:481 |
| LMF-46 | عنوان | تكليف الإدارة وملاحظاتها | public/assets/js/app/pages/lawyer/matter.js:485 |
| LMF-47 | زر | سجّل النتيجة | public/assets/js/app/pages/lawyer/matter.js:498 |
| LMF-48 | زر | إضافة جلسة | public/assets/js/app/pages/lawyer/matter.js:499 |
| LMF-49 | زر | إضافة مهمة | public/assets/js/app/pages/lawyer/matter.js:500 |
| LMF-50 | تنبيه | هذا الملف المستمر مغلق — العرض للقراءة فقط. | public/assets/js/app/pages/lawyer/matter.js:562 |

## STM: مستحقاتي (`/app#/my/statement`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| STM-01 | عنوان | مستحقاتي | public/assets/js/app/pages/lawyer/statement.js:46 |
| STM-02 | قسم/بطاقة | (نص متغير) | public/assets/js/app/pages/lawyer/statement.js:46 |
| STM-03 | قسم/بطاقة | مساهماتك التطوعية هذا الشهر | public/assets/js/app/pages/lawyer/statement.js:62 |
| STM-04 | عنوان | (نص متغير) | public/assets/js/app/pages/lawyer/statement.js:63 |
| STM-05 | قسم/بطاقة | المتوقع لك هذا الشهر | public/assets/js/app/pages/lawyer/statement.js:80 |
| STM-06 | عنوان | (نص متغير) | public/assets/js/app/pages/lawyer/statement.js:81 |
| STM-07 | قسم/بطاقة | لم يُصرف بعد | public/assets/js/app/pages/lawyer/statement.js:96 |
| STM-08 | عنوان | لم يُصرف بعد | public/assets/js/app/pages/lawyer/statement.js:97 |
| STM-09 | قسم/بطاقة | الأشهر السابقة | public/assets/js/app/pages/lawyer/statement.js:112 |
| STM-10 | عنوان | الأشهر السابقة | public/assets/js/app/pages/lawyer/statement.js:112 |
| STM-11 | سؤال قابل للفتح | صُرف | public/assets/js/app/pages/lawyer/statement.js:120 |
| STM-12 | عنوان | (نص متغير) | public/assets/js/app/pages/lawyer/statement.js:122 |
| STM-13 | سؤال قابل للفتح | اتفاقك | public/assets/js/app/pages/lawyer/statement.js:141 |
| STM-14 | عنوان | اتفاقك | public/assets/js/app/pages/lawyer/statement.js:141 |
| STM-15 | سؤال قابل للفتح | أدائي | public/assets/js/app/pages/lawyer/statement.js:167 |
| STM-16 | عنوان | أدائي | public/assets/js/app/pages/lawyer/statement.js:167 |
| STM-17 | قسم/بطاقة | مستحقاتي | public/assets/js/app/pages/lawyer/statement.js:185 |
| STM-18 | عنوان | مستحقاتي | public/assets/js/app/pages/lawyer/statement.js:185 |

## W: رسائل واتساب (`/app#/tags`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| W-01 | رسالة واتساب | أفراد وشركات: «أهلًا بكم في {firm_name}. اختاروا نوع الخدمة، أو اكتبوا موضوعكم مباشرة.»<br>يظهر النص نفسه أيضًا في: T-02، S-12، I-57 (الخيار الأول)، PTH-01، T-40، S-13، T-53، S-14<br>يُعدَّل من الإعدادات ← الصفحة الأولى ← الاسم القانوني للمكتب | src/constants.js:1372 · src/constants.js:289 (LABELS) · src/constants.js:1358 (LINES_MENU_TEXTS) · src/constants.js:1421 |
| W-02 | رسالة واتساب | أفراد وشركات: «في أي مجال؟» | src/constants.js:1373 · src/constants.js:1360 (LINES_MENU_TEXTS) |
| W-03 | رسالة واتساب | أفراد وشركات: «ما وضع القضية؟» | src/constants.js:1374 · src/constants.js:1361 (LINES_MENU_TEXTS) |
| W-04 | رسالة واتساب | أفراد وشركات: «ما الذي تحتاجونه؟» | src/constants.js:1375 · src/constants.js:1362 (LINES_MENU_TEXTS) |
| W-05 | رسالة واتساب | أفراد وشركات: «شكرًا لكم. اكتبوا الموضوع باختصار، ويمكنكم إرسال صور المستندات أو رسالة صوتية، وعند الانت…» | src/constants.js:1376 · src/constants.js:291 (LABELS) · src/constants.js:1364 (LINES_MENU_TEXTS) |
| W-06 | رسالة واتساب | أفراد وشركات: «شكرًا لكم. سيتواصل معكم فريقنا لترتيب عرض يناسب شركتكم.» | src/constants.js:1377 · src/constants.js:1365 (LINES_MENU_TEXTS) · src/constants.js:1422 |
| W-07 | رسالة واتساب | خيري: «كود دخول صفحتك عند {org_name}: {code} محدش من عندنا هيطلبه منك أبدًا.» | src/constants.js:1379 · src/constants.js:439 (LABELS) · src/constants.js:1267 (CLIENT_TEXTS) |
| W-08 | رسالة واتساب | خيري: «أهلًا يا {first_name}، في جديد في طلبك عند {org_name}. افتح{ي} صفحتك من هنا: {portal_link}» · أفراد وشركات: «مرحبًا {first_name}، يوجد جديد في طلبكم لدى {org_name}. صفحة طلبكم: {portal_link}» | src/constants.js:1380 · src/constants.js:447 (LABELS) · src/constants.js:1268 (CLIENT_TEXTS) · src/constants.js:1300 (CLIENT_TEXTS_PAID) |
| W-09 | رسالة واتساب | خيري: «أهلًا يا {first_name}، وصلتنا رسالتك. رقم طلبك: {ref} من دلوقتي هنبعتلك أي جديد هنا على و…» · أفراد وشركات: «مرحبًا {first_name}، وصلتنا رسالتكم. رقم طلبكم: {ref} سنرسل لكم أي جديد هنا على واتساب. ص…» | src/constants.js:1381 · src/constants.js:1269 (CLIENT_TEXTS) · src/constants.js:1301 (CLIENT_TEXTS_PAID) |
| W-10 | رسالة واتساب | خيري: «صوّر{ي} الورقة وابعت{ي}ها هنا، أو من صفحتك: {portal_link}» · أفراد وشركات: «يمكنكم تصوير المستند وإرساله هنا، أو من صفحة طلبكم: {portal_link}» | src/constants.js:1382 · src/constants.js:1270 (CLIENT_TEXTS) · src/constants.js:1302 (CLIENT_TEXTS_PAID) |
| W-11 | رسالة واتساب | خيري: «رد{ي} علينا هنا بكتابة أو برسالة صوتية.» · أفراد وشركات: «يرجى الرد علينا هنا كتابةً أو برسالة صوتية.» | src/constants.js:1383 · src/constants.js:1271 (CLIENT_TEXTS) · src/constants.js:1303 (CLIENT_TEXTS_PAID) |
| W-12 | رسالة واتساب | خيري: «بعتنالك ورقة «{title}». تقدر{ي} تنزّل{ي}ها من صفحتك. — {org_name}» · أفراد وشركات: «أرسلنا لكم مستند «{title}»، ويمكنكم تنزيله من صفحة طلبكم. — {org_name}» | src/constants.js:1384 · src/constants.js:1272 (CLIENT_TEXTS) · src/constants.js:1304 (CLIENT_TEXTS_PAID) |
| W-13 | رسالة واتساب | خيري: «بعتنالك ورقة «{title}». — {org_name}» · أفراد وشركات: «أرسلنا لكم مستند «{title}». — {org_name}» | src/constants.js:1385 · src/constants.js:1273 (CLIENT_TEXTS) · src/constants.js:1305 (CLIENT_TEXTS_PAID) |
| W-14 | رسالة واتساب | خيري: «أهلًا يا {first_name}، يا ترى ردّنا فادك؟» · أفراد وشركات: «مرحبًا {first_name}، كيف تقيّمون خدمتنا؟» | src/constants.js:1386 · src/constants.js:1274 (CLIENT_TEXTS) · src/constants.js:1306 (CLIENT_TEXTS_PAID) |
| W-15 | رسالة واتساب | خيري: «أو ابعت{ي} رقم من 1 لـ 5» · أفراد وشركات: «أو أرسلوا رقمًا من 1 إلى 5» | src/constants.js:1387 · src/constants.js:1275 (CLIENT_TEXTS) · src/constants.js:1307 (CLIENT_TEXTS_PAID) |
| W-16 | رسالة واتساب | خيري: «شكرًا على رأيك يا {first_name}. إحنا معاك{ي} في أي وقت. — {org_name}» · أفراد وشركات: «شكرًا لتقييمكم. نحن في خدمتكم دائمًا. — {org_name}» | src/constants.js:1388 · src/constants.js:1276 (CLIENT_TEXTS) · src/constants.js:1308 (CLIENT_TEXTS_PAID) |
| W-17 | رسالة واتساب | خيري: «متأسفين إن تجربتك ما كانتش كويسة. قول{ي} لنا في رسالة واحدة إيه اللي ما عجبك{ي}ش، وهنكلمك…» · أفراد وشركات: «نأسف لأن تجربتكم لم تكن كما ينبغي. يسعدنا أن تخبرونا في رسالة واحدة بما لم يعجبكم، وسنتوا…» | src/constants.js:1389 · src/constants.js:1277 (CLIENT_TEXTS) · src/constants.js:1309 (CLIENT_TEXTS_PAID) |
| W-18 | رسالة واتساب | خيري: «شكرًا، وصلتنا ملاحظتك وهنتابعها معاك{ي}. — {org_name}» · أفراد وشركات: «شكرًا، وصلتنا ملاحظتكم وسنتابعها معكم. — {org_name}» | src/constants.js:1390 · src/constants.js:1278 (CLIENT_TEXTS) · src/constants.js:1310 (CLIENT_TEXTS_PAID) |
| W-19 | رسالة واتساب | خيري: «أهلًا يا {first_name}، دي صفحة طلبك عند {org_name}. منها تعرف{ي} كل جديد وتبعت{ي} الورق:…» · أفراد وشركات: «مرحبًا {first_name}، هذه صفحة طلبكم لدى {org_name}، ومنها تتابعون كل جديد وترسلون المستند…» | src/constants.js:1391 · src/constants.js:1279 (CLIENT_TEXTS) · src/constants.js:1311 (CLIENT_TEXTS_PAID) |
| W-20 | رسالة واتساب | خيري: «{hello}، ده الدعم القانوني في {org_name}. الاستشارة ببلاش وكلامك سر عندنا. اختار{ي} موضوع…» · أفراد وشركات: «{hello}، شكرًا لتواصلكم مع {org_name}. اختاروا موضوع الاستشارة من القائمة، أو اكتبوا موضو…» | src/constants.js:1392 · src/constants.js:282 (LABELS) · src/constants.js:1282 (CLIENT_TEXTS) · src/constants.js:1312 (CLIENT_TEXTS_PAID) |
| W-21 | رسالة واتساب | خيري: «الدعم القانوني — {org_name}» · أفراد وشركات: «خدمات قانونية — {org_name}» | src/constants.js:1393 · src/constants.js:1284 (CLIENT_TEXTS) · src/constants.js:1314 (CLIENT_TEXTS_PAID) |
| W-22 | رسالة واتساب | خيري: «اختار{ي} الموضوع» · أفراد وشركات: «اختيار الموضوع» | src/constants.js:1394 · src/constants.js:1285 (CLIENT_TEXTS) · src/constants.js:1315 (CLIENT_TEXTS_PAID) |
| W-23 | رسالة واتساب | خيري: «مواضيع بنساعد فيها» · أفراد وشركات: «مجالات الاستشارة» | src/constants.js:1395 · src/constants.js:1286 (CLIENT_TEXTS) · src/constants.js:1316 (CLIENT_TEXTS_PAID) · src/services/stories.js:596 (@tag-src) |
| W-24 | رسالة واتساب | خيري: «مش لازم تختار{ي} — اكتب{ي} أو سجّل{ي} على طول» · أفراد وشركات: «يمكنكم الكتابة مباشرة دون اختيار» | src/constants.js:1396 · src/constants.js:1287 (CLIENT_TEXTS) · src/constants.js:1317 (CLIENT_TEXTS_PAID) |
| W-25 | رسالة واتساب | خيري: «تمام. احكيلنا حصل إيه بالكتابة أو برسالة صوتية، ولما تخلّص{ي} ابعت{ي} «خلاص»، أو اصبر{ي}…» · أفراد وشركات: «شكرًا. يرجى كتابة تفاصيل موضوعكم أو إرسالها في رسالة صوتية، وعند الانتهاء أرسلوا «خلاص».» | src/constants.js:1397 · src/constants.js:283 (LABELS) · src/constants.js:1288 (CLIENT_TEXTS) · src/constants.js:1318 (CLIENT_TEXTS_PAID) |
| W-26 | رسالة واتساب | خيري: «{hello}. وصلتنا حكايتك، وده {ref_no}. فريقنا هيشوفها ويرد عليك{ي} هنا. لو افتكرت{ي} حاجة…» · أفراد وشركات: «{hello}، وصلنا طلبكم، وهذا {ref_no}. سيراجعه فريقنا ويتواصل معكم هنا لتحديد الخطوة التالي…» | src/constants.js:1398 · src/constants.js:284 (LABELS) · src/constants.js:1289 (CLIENT_TEXTS) · src/constants.js:1319 (CLIENT_TEXTS_PAID) |
| W-27 | رسالة واتساب | خيري: «إحنا شغالين {office_hours}، وهنرد أول ما نرجع.» · أفراد وشركات: «مواعيد العمل: {office_hours}، وسنرد عليكم فور العودة.» | src/constants.js:1399 · src/constants.js:1290 (CLIENT_TEXTS) · src/constants.js:1320 (CLIENT_TEXTS_PAID) |
| W-28 | رسالة واتساب | خيري: «{hello}، {ref_no} اتسجّل، والمحامي هيدرس مشكلتك. هنبعت لك أي جديد هنا. — {org_name}» · أفراد وشركات: «{hello}، تم تسجيل {ref_no}، وسيبدأ المحامي المختص دراسة موضوعكم وفق ما اتفقنا عليه. سنواف…» | src/constants.js:1400 · src/constants.js:1291 (CLIENT_TEXTS) · src/constants.js:1321 (CLIENT_TEXTS_PAID) |
| W-29 | رسالة واتساب | خيري: «{hello}، {ref_no} اتسجّل، والمحامي هيتابع قضيتك. هنبعت لك أي جديد هنا. — {org_name}» · أفراد وشركات: «{hello}، تم تسجيل {ref_no}، وسيتابع المحامي المختص قضيتكم وفق ما اتفقنا عليه. سنوافيكم بأ…» | src/constants.js:1401 · src/constants.js:1292 (CLIENT_TEXTS) · src/constants.js:1322 (CLIENT_TEXTS_PAID) |
| W-30 | رسالة واتساب | خيري: «{hello}، بخصوص {ref_no}: عشان نقدر نساعدك محتاجين نعرف: {questions} رد{ي} علينا هنا بالكت…» · أفراد وشركات: «{hello}، بخصوص {ref_no}: نحتاج إلى معرفة ما يلي: {questions} يرجى الرد علينا هنا كتابةً أ…» | src/constants.js:1402 · src/constants.js:1293 (CLIENT_TEXTS) · src/constants.js:1323 (CLIENT_TEXTS_PAID) |
| W-31 | رسالة واتساب | أفراد وشركات: «{hello}، نشكركم على تواصلكم. موضوعكم خارج نطاق الخدمات القانونية التي نقدمها، وننصح بالتو…» | src/constants.js:1403 · src/constants.js:1324 (CLIENT_TEXTS_PAID) |
| W-32 | رسالة واتساب | أفراد وشركات: «وأرسلنا لكم الأتعاب المقترحة في صفحة طلبكم للموافقة قبل البدء.» | src/constants.js:1404 · src/constants.js:1326 (CLIENT_TEXTS_PAID) |
| W-33 | رسالة واتساب | أفراد وشركات: «{hello}، وصلتنا رسالتكم، وهذا {ref_no}. سيراجعها فريقنا ويرد عليكم هنا. — {org_name}» | src/constants.js:1405 · src/constants.js:1328 (CLIENT_TEXTS_PAID) |
| W-34 | رسالة واتساب | محايد: «أهلًا بيكم في {org_name}. عشان نوصّلكم للفريق المناسب، اختاروا من الزرارين: • «خيري — مجا…» | src/constants.js:1406 · src/constants.js:286 (LABELS) · src/constants.js:1335 (SEGMENT_CHOICE_TEXTS) |
| W-35 | رسالة واتساب | محايد: «كلامكم سر عندنا» | src/constants.js:1407 · src/constants.js:1337 (SEGMENT_CHOICE_TEXTS) |
| W-36 | رسالة واتساب | أفراد وشركات: «شكرًا لاختياركم خدمات الأفراد والشركات. اكتبوا لنا موضوعكم باختصار أو أرسلوا رسالة صوتية،…» | src/constants.js:1408 · src/constants.js:1330 (CLIENT_TEXTS_PAID) |
| W-37 | رسالة واتساب | خيري: «تمام. احكيلنا مشكلتك بالكتابة أو برسالة صوتية، ولما تخلّص{ي} ابعت{ي} «خلاص». الاستشارة بب…» | src/constants.js:1409 · src/constants.js:1341 (CLIENT_TEXTS_CHARITY_EXTRA) |
| W-38 | رسالة واتساب | تغيير النوع: «{hello}، بعد مراجعة طلبك ({ref_no})، الموضوع ده خارج برنامج الدعم القانوني المجاني. نقدر…» | src/constants.js:1410 · src/constants.js:1346 (SEGMENT_CHANGE_TEXTS) |
| W-39 | رسالة واتساب | تغيير النوع: «مرحبًا {first_name}، بعد مراجعة طلبكم ({ref_no}) يسعدنا إبلاغكم أن موضوعكم يدخل ضمن برنام…» | src/constants.js:1411 · src/constants.js:1349 (SEGMENT_CHANGE_TEXTS) |
| W-40 | رسالة واتساب | خيري: «أهلًا يا {first_name}، عندك {event_kind} يوم {date} الساعة {time_spoken}. المكان: {locati…» · أفراد وشركات: «مرحبًا {first_name}، تذكير بموعد {event_kind} يوم {date} الساعة {time_spoken}. المكان: {l…» | src/constants.js:1412 · src/constants.js:268 (LABELS) · src/constants.js:1182 (DEFAULT_AUTOMATION_RULES) · src/constants.js:1246 (LEGACY_AUTOMATION_TEMPLATES) |
| W-41 | رسالة واتساب | خيري: «أهلًا يا {first_name}، ده تذكير بمصاريف قضيتك: {amount} ج.م ({description}). لو عندك سؤال…» · أفراد وشركات: «مرحبًا {first_name}، تذكير بمبلغ {amount} ج.م ({description}). لأي استفسار يرجى الرد علين…» | src/constants.js:1413 · src/constants.js:269 (LABELS) · src/constants.js:1194 (DEFAULT_AUTOMATION_RULES) · src/constants.js:1251 (LEGACY_AUTOMATION_TEMPLATES) |
| W-42 | رسالة واتساب | خيري: «أهلًا يا {first_name}، لسه مستنيين منك: {request} صوّر{ي} الورقة وابعت{ي}ها هنا على واتسا…» · أفراد وشركات: «مرحبًا {first_name}، ما زلنا في انتظار: {request} يمكنكم تصوير المستند وإرساله هنا على وا…» | src/constants.js:1414 · src/constants.js:270 (LABELS) · src/constants.js:1204 (DEFAULT_AUTOMATION_RULES) · src/constants.js:1255 (LEGACY_AUTOMATION_TEMPLATES) |
| W-43 | رسالة واتساب | خيري: «أهلًا يا {first_name}، يا ترى ردّنا فادك؟ ابعت{ي} رقم من 1 لـ 5 (5 = ممتاز، 1 = مش راضي{ة…» · أفراد وشركات: «مرحبًا {first_name}، يسعدنا تقييمكم لخدمتنا برقم من 1 إلى 5 (5 = ممتاز، 1 = غير راضٍ). رأ…» | src/constants.js:1415 · src/constants.js:273 (LABELS) · src/constants.js:1225 (DEFAULT_AUTOMATION_RULES) · src/constants.js:1259 (LEGACY_AUTOMATION_TEMPLATES) |
| W-44 | رسالة واتساب | أفراد وشركات: «عرض الاختيارات» | src/constants.js:1416 · src/constants.js:1363 (LINES_MENU_TEXTS) |
| W-45 | رسالة واتساب | أزرار: «خيري — مجاني · أفراد وشركات» | src/constants.js:1417 · src/constants.js:1427 (WA_BUTTON_TEXTS) |
| W-46 | رسالة واتساب | أزرار: «ممتاز · جيد · غير راضٍ · مش راضي · مش راضية» | src/constants.js:1418 · src/constants.js:1428 (WA_BUTTON_TEXTS) |
| W-47 | رسالة واتساب | أزرار: «هحضر · مش هقدر · سأحضر · لن أتمكن» | src/constants.js:1419 · src/constants.js:1429 (WA_BUTTON_TEXTS) |
| W-48 | رسالة واتساب للمحامي | المحامي: «أُسند إليك ملف جديد CS-2026-00012. سلّم رأيك قبل الثلاثاء 20 أكتوبر.» | src/services/lawyer-alerts.js:53 · src/services/lawyer-alerts.js:41 (ALERT_TEXT) |
| W-49 | رسالة واتساب للمحامي | المحامي: «أعادت الإدارة رأيك في CS-2026-00012 بملاحظات.» | src/services/lawyer-alerts.js:54 · src/services/lawyer-alerts.js:42 (ALERT_TEXT) |
| W-50 | رسالة واتساب للمحامي | المحامي: «يتبقى يوم على موعد تسليم رأيك في CS-2026-00012.» | src/services/lawyer-alerts.js:55 · src/services/lawyer-alerts.js:43 (ALERT_TEXT) |
| W-51 | رسالة واتساب للمحامي | المحامي: «تأخر رأيك في CS-2026-00012. قدّمه أو اطلب مهلة.» | src/services/lawyer-alerts.js:56 · src/services/lawyer-alerts.js:44 (ALERT_TEXT) |
| W-52 | رسالة واتساب للمحامي | المحامي: «لم تُسجَّل نتيجة جلسة اليوم في CS-2026-00012.» | src/services/lawyer-alerts.js:57 · src/services/lawyer-alerts.js:46 (ALERT_TEXT) |
| W-53 | رسالة واتساب للمحامي | المحامي: «وصلك رد من الإدارة في CS-2026-00012.» | src/services/lawyer-alerts.js:58 · src/services/lawyer-alerts.js:48 (ALERT_TEXT) |
| W-54 | رسالة واتساب للمحامي | المحامي: «اليوم مطلوب منك 3 أمور.» | src/services/lawyer-alerts.js:59 · src/services/lawyer-alerts.js:49 (ALERT_TEXT) |

## E: رسائل البريد الإلكتروني (`/app#/tags`)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| E-01 | بريد | الموضوع: «دعوة للانضمام إلى إدارتكم القانونية» · نص الرسالة: «مرحبًا أ. مريم، تلقّيتم دعوة من أ. مريم حسن للانضمام إلى بوابة شركة النيل للأغذية لدى Ema…» | src/services/email.js:293 |
| E-02 | بريد | الموضوع: «تعيين كلمة مرور جديدة لحسابكم» · نص الرسالة: «مرحبًا أ. مريم، لتعيين كلمة مرور جديدة لحسابكم على بوابة شركة النيل للأغذية افتحوا الرابط…» | src/services/email.js:294 |
| E-03 | بريد | الموضوع: «تغيّرت كلمة المرور لحسابكم» · نص الرسالة: «مرحبًا أ. مريم، تغيّرت كلمة المرور لحسابكم. إن لم تكونوا أنتم فتواصلوا مع مديري البوابة ف…» | src/services/email.js:295 |
| E-04 | بريد | الموضوع: «تغيّر البريد الإلكتروني لحسابكم» · نص الرسالة: «مرحبًا أ. مريم، غيّر فريقكم القانوني البريد الإلكتروني المسجل لحسابكم على بوابة شركة الني…» | src/services/email.js:296 |
| E-05 | بريد | الموضوع: «تحديث على طلبكم — NFD-0007» · نص الرسالة: «مرحبًا أ. مريم، يوجد تحديث على طلبكم NFD-0007. للتفاصيل افتحوا البوابة: https://…/company…» | src/services/email.js:297 |
| E-06 | بريد | الموضوع: «فريقكم القانوني يحتاج معلومة — NFD-0007» · نص الرسالة: «مرحبًا أ. مريم، يحتاج فريقكم القانوني معلومة منكم لاستكمال الطلب NFD-0007. للتفاصيل افتحو…» | src/services/email.js:298 |
| E-07 | بريد | الموضوع: «عرض سعر بانتظار موافقتكم — NFD-0007» · نص الرسالة: «مرحبًا أ. مريم، وصلكم عرض سعر على الطلب NFD-0007 بانتظار موافقتكم. للتفاصيل افتحوا البواب…» | src/services/email.js:299 |
| E-08 | بريد | الموضوع: «جاهز للمراجعة — NFD-0007» · نص الرسالة: «مرحبًا أ. مريم، التسليم الخاص بالطلب NFD-0007 جاهز للمراجعة. للتفاصيل افتحوا البوابة: htt…» | src/services/email.js:300 |
| E-09 | بريد | الموضوع: «موعد يقترب في ذاكرتكم القانونية» · نص الرسالة: «مرحبًا أ. مريم، يقترب موعد مهم في ذاكرتكم القانونية: تجديد السجل التجاري — 1 نوفمبر 2026…» | src/services/email.js:301 |
| E-10 | بريد | الموضوع: «تكلفة إضافية — NFD-0007» · نص الرسالة: «مرحبًا أ. مريم، أُضيفت تكلفة إضافية 1,500 جنيه — NFD-0007. للتفاصيل افتحوا البوابة: https…» | src/services/email.js:302 |
| E-11 | بريد | الموضوع: «تنتهي الفترة التجريبية بعد 3 أيام» · نص الرسالة: «مرحبًا أ. مريم، تنتهي الفترة التجريبية لبوابة شركتكم بعد 3 أيام. للاستمرار اختاروا باقة م…» | src/services/email.js:303 |
| E-12 | بريد | الموضوع: «طلب جديد من شركة النيل للأغذية: NFD-0007» · نص الرسالة: «طلب جديد من شركة النيل للأغذية: NFD-0007 https://…/app#/company-requests/12» | src/services/email.js:304 |
| E-13 | بريد | الموضوع: «رسالة تجربة من منصة المكتب» · نص الرسالة: «هذه رسالة تجربة للتأكد من إعدادات البريد الإلكتروني. — فريقكم القانوني في Emam Legal and…» | src/services/email.js:305 |
| E-14 | بريد | التحية: «مرحبًا …،» | src/services/email.js:306 |
| E-15 | بريد | التذييل: «— فريقكم القانوني في … · رسالة آلية؛ للرد استخدموا البوابة.» | src/services/email.js:307 |

## D: المستندات المطبوعة (يظهر في: المستندات المطبوعة من صفحات الملفات)

| الرمز | النوع | النص | مكانه في الملفات |
|---|---|---|---|
| D-01 | مستند مطبوع | الرقم: | public/assets/js/app/pages/print.js:491 |
| D-02 | مستند مطبوع | الرقم: | public/assets/js/app/pages/print.js:499 |
| D-03 | مستند مطبوع | … رقم | public/assets/js/app/pages/print.js:511 |
| D-04 | مستند مطبوع | (نص متغير) | public/assets/js/app/pages/print.js:611 |
| D-05 | مستند مطبوع | (نص متغير) | public/assets/js/app/pages/print.js:617 |
| D-06 | مستند مطبوع | مسددة | public/assets/js/app/pages/print.js:610 |
| D-07 | مستند مطبوع | … رقم … | public/assets/js/app/pages/print.js:616 |
| D-08 | مستند مطبوع | طباعة أو حفظ PDF | public/assets/js/app/pages/print.js:566 |
| D-09 | مستند مطبوع | طباعة أو حفظ PDF | public/assets/js/app/pages/print.js:572 |
| D-10 | مستند مطبوع | رجوع | public/assets/js/app/pages/print.js:576 |
| D-11 | مستند مطبوع | لحفظ نسخة إلكترونية اختر «حفظ بتنسيق PDF» من نافذة الطباعة، واضبط الو… | public/assets/js/app/pages/print.js:577 |
| D-12 | مستند مطبوع | تحديث الفترة | public/assets/js/app/pages/print.js:551 |
| D-13 | مستند مطبوع | تحديث الفترة | public/assets/js/app/pages/print.js:560 |
| D-14 | مستند مطبوع | (نص متغير) | public/assets/js/app/pages/print.js:532 |
| D-15 | مستند مطبوع | المحاسب | public/assets/js/app/pages/print.js:134 |
| D-16 | مستند مطبوع | (نص متغير) | public/assets/js/app/pages/print.js:135 |
| D-17 | مستند مطبوع | فاتورة إلى | public/assets/js/app/pages/print.js:86 |
| D-18 | مستند مطبوع | تاريخ الإصدار | public/assets/js/app/pages/print.js:98 |
| D-19 | مستند مطبوع | م | public/assets/js/app/pages/print.js:103 |
| D-20 | مستند مطبوع | المبلغ بالحروف: | public/assets/js/app/pages/print.js:118 |
| D-21 | مستند مطبوع | المدفوعات المسجلة على الفاتورة | public/assets/js/app/pages/print.js:120 |
| D-22 | مستند مطبوع | (نص متغير) | public/assets/js/app/pages/print.js:133 |
| D-23 | مستند مطبوع | المبلغ | public/assets/js/app/pages/print.js:145 |
| D-24 | مستند مطبوع | قيمة الفاتورة | public/assets/js/app/pages/print.js:156 |
| D-25 | مستند مطبوع | هذا الإيصال لا يُعتد به إلا بعد ختمه بخاتم المؤسسة. يُرجى الاحتفاظ به. | public/assets/js/app/pages/print.js:163 |
| D-26 | مستند مطبوع | مسودة لم تُرسل للمستفيد بعد — غير معتمدة للتسليم. | public/assets/js/app/pages/print.js:184 |
| D-27 | مستند مطبوع | رقم الملف | public/assets/js/app/pages/print.js:185 |
| D-28 | مستند مطبوع | إلى: | public/assets/js/app/pages/print.js:189 |
| D-29 | مستند مطبوع | الموضوع: | public/assets/js/app/pages/print.js:190 |
| D-30 | مستند مطبوع | تحية طيبة وبعد، | public/assets/js/app/pages/print.js:192 |
| D-31 | مستند مطبوع | (نص متغير) | public/assets/js/app/pages/print.js:193 |
| D-32 | مستند مطبوع | وتفضلوا بقبول فائق الاحترام والتقدير، | public/assets/js/app/pages/print.js:194 |
| D-33 | مستند مطبوع | (نص متغير) | public/assets/js/app/pages/print.js:195 |
| D-34 | مستند مطبوع | (نص متغير) | public/assets/js/app/pages/print.js:196 |
| D-35 | مستند مطبوع | المحامي | public/assets/js/app/pages/print.js:204 |
| D-36 | مستند مطبوع | الرصيد الافتتاحي | public/assets/js/app/pages/print.js:212 |
| D-37 | مستند مطبوع | الرصيد الختامي بالحروف: | public/assets/js/app/pages/print.js:218 |
| D-38 | مستند مطبوع | قيود المستحقات خلال الفترة | public/assets/js/app/pages/print.js:219 |
| D-39 | مستند مطبوع | المبالغ المصروفة خلال الفترة | public/assets/js/app/pages/print.js:234 |
| D-40 | مستند مطبوع | الاستشارات المعتمدة خلال الفترة | public/assets/js/app/pages/print.js:247 |
| D-41 | مستند مطبوع | الرصيد الختامي = الرصيد الافتتاحي + المستحق خلال الفترة − المصروف خلا… | public/assets/js/app/pages/print.js:251 |
| D-42 | مستند مطبوع | سري — للاستخدام الداخلي في ملفات المؤسسة فقط. لا يُسلَّم للمستفيد ولا… | public/assets/js/app/pages/print.js:259 |
| D-43 | مستند مطبوع | رقم الملف | public/assets/js/app/pages/print.js:260 |
| D-44 | مستند مطبوع | ملخص الوقائع (المتاح للمحامين) | public/assets/js/app/pages/print.js:278 |
| D-45 | مستند مطبوع | ملاحظات داخلية | public/assets/js/app/pages/print.js:279 |
| D-46 | مستند مطبوع | المسائل القانونية | public/assets/js/app/pages/print.js:280 |
| D-47 | مستند مطبوع | فريق العمل | public/assets/js/app/pages/print.js:286 |
| D-48 | مستند مطبوع | طلبات المعلومات والمستندات | public/assets/js/app/pages/print.js:303 |
| D-49 | مستند مطبوع | الردود على المستفيد | public/assets/js/app/pages/print.js:316 |
| D-50 | مستند مطبوع | المستندات (… ) | public/assets/js/app/pages/print.js:328 |
| D-51 | مستند مطبوع | تكلفة الملف | public/assets/js/app/pages/print.js:340 |
| D-52 | مستند مطبوع | السجل الزمني (أحدث … من … ) | public/assets/js/app/pages/print.js:350 |
| D-53 | مستند مطبوع | البرنامج | public/assets/js/app/pages/print.js:371 |
| D-54 | مستند مطبوع | (نص متغير) | public/assets/js/app/pages/print.js:383 |
| D-55 | مستند مطبوع | الموقف المالي | public/assets/js/app/pages/print.js:384 |
| D-56 | مستند مطبوع | الإنفاق الشهري | public/assets/js/app/pages/print.js:408 |
| D-57 | مستند مطبوع | المستفيدون والنتائج | public/assets/js/app/pages/print.js:420 |
| D-58 | مستند مطبوع | الملفات الممولة من البرنامج | public/assets/js/app/pages/print.js:438 |
| D-59 | مستند مطبوع | قيود الصرف وشروط الجهة الممولة | public/assets/js/app/pages/print.js:453 |
| D-60 | مستند مطبوع | أُعد هذا التقرير آليًا من منصة التشغيل القانوني. لا يتضمن أسماء المست… | public/assets/js/app/pages/print.js:454 |
| D-61 | مستند مطبوع | المستلم | public/assets/js/app/pages/print.js:161 |
| D-62 | مستند مطبوع | (نص متغير) | public/assets/js/app/pages/print.js:162 |
| D-63 | مستند مطبوع | المحاسب | public/assets/js/app/pages/print.js:252 |
| D-64 | مستند مطبوع | مدير البرنامج | public/assets/js/app/pages/print.js:455 |
| D-65 | مستند مطبوع | (نص متغير) | public/assets/js/app/components/print-button.js:57 |

## النطاقات المحجوزة (Reserved ranges)

| النطاق | المسار | ملاحظة للمهندسين |
|---|---|---|
| L-01…L-11 | entry | entry and tree page chrome (L-07 = نتصل بكم) |
| T-01…T-83 | entry | tree questions and options (E12-02 + r2 T-82, T-83) |
| S-10…S-16 | entry | /services hero (S-12, S-13, S-14 the three lines) |
| S-20…S-23 | entry | how we work |
| S-30…S-37 | entry | companies band |
| S-40…S-44 | entry | trust (our commitments) |
| S-45…S-47 | entry | partners (r2) |
| S-50…S-55 | entry | FAQ |
| S-60…S-62 | entry | contact |
| S-65…S-69 | entry | end band |
| H-01…H-11 | entry | paid public header |
| F-01…F-16 | entry | paid public footer (F-16 خيري, restored only) |
| F-20…F-20 | entry | © line |
| KH-01…KH-04 | entry | charity archived notice: KH-01 text, KH-02 WhatsApp, KH-03 follow-up, KH-04 legal links |
| KH-05…KH-99 | 12.1 | archived charity screens, untagged in 12.0 |
| PV-01…PV-04 | media | privacy paragraphs (STT, scan, OCR) |
| DD-01…DD-01 | media | data-deletion paragraph |
| I-01…I-04 | entry | intake chrome |
| I-11…I-25 | entry | questions (I-23 judgment.when, I-24 alimony.for, I-25 rent.side) |
| I-30…I-34 | entry | story |
| I-40…I-43 | entry | documents |
| I-50…I-58 | entry | contact and call-back (I-58 رقم من خارج مصر؟) |
| I-60…I-68 | entry | success (I-67 urgent line, I-68 call-now link) |
| I-80…I-149 | entry | answers |
| IC-01…IC-16 | entry | company lead (IC-16 رقم من خارج مصر؟) |
| UP-01…UP-10 | media | upload tool |
| SC-01…SC-20 | media | scanner sheet |
| P-01…P-09 | media | /p/ follow-up page (scanner and voice archive) |
| CK-01…CK-05 | media | company forms (scanner) |
| KIT-01…KIT-05 | media | ui.js internals |
| SRC-01…SRC-04 | media | global search (SRC-04 recall note) |
| DSH-01…DSH-04 | staff-lines | dashboard |
| INB-01…INB-08 | staff-lines | inbox: INB-01…06 the كل الأنواع select, INB-07 returning-charity chip, INB-08 opted-out chip |
| PTH-01…PTH-15 | staff-lines | pathway UI: chip, path line, edit, PTH-04 docket path, PTH-05 suggestion, sheet fields and actions |
| DOC-01…DOC-17 | media | document viewer (DOC-16 clean-copy label, DOC-17 HEIC note) |
| VTR-01…VTR-10 | media | voice box (VTR-09 listen first, VTR-10 no speech) |
| ANL-01…ANL-06 | staff-lines | analytics |
| SIM-01…SIM-04 | staff-lines | simulator |
| SET-01…SET-19 | staff-lines | settings: الصفحة الأولى card, lines menu, story settings |
| SET-20…SET-39 | media | settings: المستندات والصوت card |
| INT-01…INT-17 | media | integrations (INT-16 vendor name, INT-17 attestation) |
| SYS-01…SYS-10 | media | system health (SYS-09 memory, SYS-10 disk) |
| W-01…W-06 | staff-lines | WhatsApp lines menu: W-01 buttons, W-02…W-04 lists, W-05 after row, W-06 counsel |

## الرموز المتقاعدة (Retired codes)

| الرمز | تقاعد في الإصدار | كان | انتقل إلى |
|---|---|---|---|
| — | — | — | — |
