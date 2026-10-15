// v12 entry (EN-9، E12-59، L12-41) — بيانات العرض للصفحة الأولى (الشجرة) وطلب الأفراد والشركات من أوراقها.
// كل الطلبات تمر بقواعد POST /api/public/intake نفسها (app.publicIntake) فتظهر للإدارة كما تظهر الطلبات الحقيقية: نوع الخدمة
// «أفراد وشركات»، والخط والمسار «من الموقع»، والاستعجال من أسئلة الورقة. أشخاص وأرقام وهمية (01092000501…506).
//
//   501 «نورا عادل»     استشارة › الأسرة والميراث › الطلاق أو الخلع (بلا أسئلة)
//   502 «مجدي فهمي»     استشارة › عقارات وإيجار › إيجار قديم (أنتم المالك أم المستأجر؟ ← المستأجر) + نتصل بكم صباحًا
//   503 «شريف منصور»    دعوى › الرد على دعوى مرفوعة › عمل (جلسة خلال أسبوعين ← عاجل)
//   504 «هالة رمزي»     دعوى › صدر حكم › أسرة وميراث (خلال آخر أسبوعين ← عاجل)
//   505 «يوسف الشريف»   شركات › تأسيس شركة › شركة ذات مسؤولية محدودة
//   506 «مها السعيد»    شركات › مستشار قانوني للشركة › طلب عرض (شركة «الدلتا للتوريدات»)
//
// وأسبوع من عدادات زيارات صفحات الشجرة (entry_tree_daily)، واسم المكتب القانوني للعرض «إمام وشركاه» (يطابق الشعار).
// لا شركاء ولا سنة تأسيس ولا مدينة (L12-41: لا أشخاص وهميون في صفحة المكتب). لا يُرسل شيء، ولا مهام وسائط (L12-69).

import { cairoDayKey } from './util.js';

export const ENTRY_DEMO_PHONES = ['01092000501', '01092000502', '01092000503', '01092000504', '01092000505', '01092000506'];
const ATTR = { landing_path: '/', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'emam-tree' };

/** زيارات أسبوع لكل صفحة: [المسار ('' = «/»)، متوسط يومي] — أرقام عرض فقط */
const VIEWS = [
  ['', 140],
  ['consultation', 58],
  ['consultation/family', 31],
  ['consultation/property', 12],
  ['consultation/work', 6],
  ['litigation', 41],
  ['litigation/defend', 17],
  ['litigation/new', 14],
  ['litigation/judgment', 7],
  ['company', 23],
  ['company/new', 11],
  ['company/counsel', 6],
  ['khayri', 4],
];

/**
 * @param {object} app
 * @param {{ at?: (daysAgo:number, hour?:number, minute?:number) => void, realNow?: number }} [opts]
 * @returns {Record<string, string|null>} أرقام الطلبات (للاختبارات)
 */
export function seedV12Entry(app, { at = () => {}, realNow = Date.now() } = {}) {
  const refs = {};
  // L12-12/L12-41: اسم المكتب في العرض فقط (الإنتاج يبدأ فارغًا، فيظهر اسم العلامة)
  app.settings.set('firm_legal_name', 'إمام وشركاه');
  if (typeof app.publicIntake !== 'function' || !app.pathways) return refs;

  const send = (key, daysAgo, hour, minute, body) => {
    at(daysAgo, hour, minute);
    try {
      const r = app.publicIntake({ consent: true, consent_v: 1, segment: 'paid', entry: 'tree', mode: 'tiles', attribution: ATTR, ...body });
      refs[key] = r?.body?.reference || null;
    } catch (e) {
      app.log?.('seed-v12-entry', e);
      refs[key] = null;
    }
  };
  const [p1, p2, p3, p4, p5, p6] = ENTRY_DEMO_PHONES;

  send('divorce', 5, 11, 20, {
    name: 'نورا عادل',
    phone: p1,
    pathway: 'consultation/family/divorce',
    description: 'متزوجة منذ ست سنوات ولدينا طفلان. زوجي يرفض الطلاق، وأريد أن أعرف خطوات الخلع والمدة المتوقعة وما يحق لي.',
    submission_id: 'seed_v12_entry_00001',
  });
  send('oldRent', 4, 13, 5, {
    name: 'مجدي فهمي',
    phone: p2,
    pathway: 'consultation/property/old-rent',
    answers: { 'rent.side': 'tenant' },
    description: 'شقة بإيجار قديم منذ 1985 باسم والدي رحمه الله، والمالك يطلب منا الإخلاء بعد القانون الجديد. هل لنا حق البقاء؟',
    callback: 'morning',
    submission_id: 'seed_v12_entry_00002',
  });
  send('defendSoon', 2, 10, 40, {
    name: 'شريف منصور',
    phone: p3,
    pathway: 'litigation/defend/labour',
    answers: { 'case.next': 'soon' },
    description: 'وصلني إعلان بدعوى من الشركة التي كنت أعمل بها تطالبني بتعويض عن ترك العمل، والجلسة بعد عشرة أيام.',
    submission_id: 'seed_v12_entry_00003',
  });
  send('judgment', 1, 16, 15, {
    name: 'هالة رمزي',
    phone: p4,
    pathway: 'litigation/judgment/family',
    answers: { 'judgment.when': 'recent' },
    description: 'صدر حكم نفقة لصالحي الأسبوع الماضي، وأريد أن أعرف كيف أنفذه، وهل يحق للطرف الآخر الاستئناف.',
    submission_id: 'seed_v12_entry_00004',
  });
  send('llc', 3, 12, 0, {
    name: 'يوسف الشريف',
    phone: p5,
    pathway: 'company/new/llc',
    description: 'نريد تأسيس شركة ذات مسؤولية محدودة لتجارة الأجهزة الطبية، بثلاثة شركاء في القاهرة، ورأس مال 500 ألف جنيه.',
    submission_id: 'seed_v12_entry_00005',
  });
  send('proposal', 0, 9, 30, {
    name: 'مها السعيد',
    phone: p6,
    pathway: 'company/counsel/proposal',
    requester: { kind: 'company', company_name: 'الدلتا للتوريدات', job_title: 'مديرة الموارد البشرية', employees: '11-50', needs: ['contracts', 'employees'] },
    description: 'نحتاج مراجعة عقود الموردين وعقود العمل بشكل شهري، ولدينا 35 موظفًا.',
    submission_id: 'seed_v12_entry_00006',
  });

  // E12-55/L12-80: أسبوع من العدادات (يُكتب مباشرة، كما يكتبها flushViews)
  try {
    const day = 24 * 60 * 60 * 1000;
    for (let d = 7; d >= 1; d -= 1) {
      const key = cairoDayKey(new Date(realNow - d * day).toISOString());
      const wobble = 0.75 + ((d * 37) % 11) / 20;
      for (const [node, avg] of VIEWS) {
        app.db.run(
          'INSERT INTO entry_tree_daily (day, node, views) VALUES (?, ?, ?) ON CONFLICT(day, node) DO UPDATE SET views = excluded.views',
          key,
          node,
          Math.max(1, Math.round(avg * wobble)),
        );
      }
    }
  } catch (e) {
    app.log?.('seed-v12-entry: views', e);
  }
  return refs;
}
