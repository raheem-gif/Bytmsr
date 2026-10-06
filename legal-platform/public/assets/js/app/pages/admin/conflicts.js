// فحص تعارض المصالح — (الإصدار 9 — وحدة practice)
// بحث يدوي باسم (بكل صيغ كتابته العربية) أو رقم قومي في كل العملاء وأطراف الملفات، وآخر التنبيهات التلقائية.
import { h, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { relative, dateTime, toLatinDigits } from '../../../lib/fmt.js';
import { pageHeader, card, form, badge, codeTag, emptyState, loading, errorState, alertBox, table, icon } from '../../../lib/ui.js';
import { matchList } from '../../components/parties.js';

export default async function render(ctx) {
  const results = h('div.v9p-conflict-results', { 'aria-live': 'polite' });
  const recentBody = h('div', loading());

  const f = form(
    [
      { name: 'name', label: 'الاسم', maxLength: 150, placeholder: 'مثال: عبدالله محمد أحمد', hint: 'تُوحَّد الحروف (أ/إ/ا، ة/ه، ى/ي) والألقاب و«عبد ال…» قبل المقارنة.' },
      { name: 'national_id', label: 'الرقم القومي (اختياري)', ltr: true, maxLength: 14, hint: '14 رقمًا' },
      {
        name: 'as',
        label: 'صفة الشخص المطلوب فحصه',
        type: 'select',
        required: true,
        placeholder: false,
        options: [
          { value: 'client', label: 'مستفيد محتمل (قبل قبول ملف جديد)' },
          { value: 'opponent', label: 'خصم (قبل تسجيله في ملف)' },
        ],
      },
    ],
    {
      values: { as: ctx.query.as === 'opponent' ? 'opponent' : 'client', name: ctx.query.name || '' },
      submitLabel: 'افحص',
      submitIcon: 'search',
      columns: 1,
      onSubmit: async (v) => {
        const nid = toLatinDigits(v.national_id || '').replace(/\s/g, '');
        if (!v.name && !nid) throw new Error('اكتب اسمًا أو رقمًا قوميًا للبحث');
        if (nid && !/^[23]\d{13}$/.test(nid)) {
          const err = new Error('الرقم القومي يجب أن يتكون من 14 رقمًا ويبدأ بـ 2 أو 3');
          err.details = { national_id: 'الرقم القومي يجب أن يتكون من 14 رقمًا ويبدأ بـ 2 أو 3' };
          throw err;
        }
        mount(results, loading('جارٍ الفحص…'));
        try {
          const r = await api.post('/admin/conflicts/check', { name: v.name || null, national_id: nid || null, as: v.as });
          showResult(r);
          loadRecent();
        } catch (err) {
          mount(results, errorState(err));
          throw err;
        }
      },
    },
  );

  function showResult(r) {
    const high = r.matches.filter((m) => m.level === 'high').length;
    const review = r.matches.filter((m) => m.level === 'review').length;
    const who = r.query.name ? `«${r.query.name}»` : `صاحب الرقم القومي المنتهي بـ ${r.query.national_id}`;
    const head = high
      ? alertBox(`وُجد تطابق قد يمثل تعارض مصالح مع ${who}. راجع التفاصيل قبل قبول الملف أو تسجيل الطرف.`, 'danger', { title: 'تعارض مصالح محتمل', icon: 'alert' })
      : review
        ? alertBox(`توجد تطابقات تحتاج مراجعة يدوية للتأكد من أنها ليست الشخص نفسه.`, 'warning', { title: 'يحتاج مراجعة', icon: 'flag' })
        : r.matches.length
          ? alertBox(`لا يوجد تعارض، وتوجد تطابقات للعلم فقط.`, 'info', { title: 'لا تعارض', icon: 'info' })
          : alertBox(`لا يوجد أي تطابق مع ${who} في مستفيدي المؤسسة أو أطراف ملفاتها.`, 'success', { title: 'لا يوجد تعارض مسجل', icon: 'checkCircle' });
    mount(
      results,
      h(
        'div.stack',
        head,
        r.generic && alertBox('الاسم المكتوب وصف عام (مثل «المطلق» أو «التاجر») ولا يصلح للمطابقة. اكتب الاسم الحقيقي أو الرقم القومي.', 'warning'),
        r.matches.length ? matchList(r.matches) : null,
        h('p.small.muted', 'سُجّلت نتيجة هذا الفحص في سجل النشاط.'),
      ),
    );
  }

  async function loadRecent() {
    try {
      const { items } = await api.get('/admin/conflicts/recent', { limit: 30 });
      if (!items.length) {
        mount(recentBody, emptyState('لم تُسجَّل أي تطابقات في الفحوص التلقائية بعد.', null, { compact: true, icon: 'shieldCheck' }));
        return;
      }
      mount(
        recentBody,
        table({
          caption: 'آخر نتائج فحص تعارض المصالح التي وُجد فيها تطابق',
          columns: [
            { key: 'created_at', label: 'الوقت', render: (r) => h('time', { datetime: r.created_at, title: dateTime(r.created_at) }, relative(r.created_at)) },
            {
              key: 'file',
              label: 'الملف',
              render: (r) =>
                r.matter_id ? h('a', { href: `#/matters/${r.matter_id}` }, codeTag(r.matter_code)) : r.case_id ? h('a', { href: `#/cases/${r.case_id}` }, codeTag(r.case_code)) : h('span.muted', 'بحث يدوي'),
            },
            { key: 'summary', label: 'النتيجة', render: (r) => h('span', r.summary) },
            {
              key: 'level',
              label: 'المستوى',
              render: (r) => (r.high ? badge('تعارض محتمل', 'danger') : r.review ? badge('يحتاج مراجعة', 'warning') : badge('للعلم', 'info')),
            },
            { key: 'actor_name', label: 'بواسطة', render: (r) => r.actor_name || 'النظام' },
          ],
          rows: items,
        }),
      );
    } catch (err) {
      mount(recentBody, errorState(err, loadRecent));
    }
  }

  mount(results, emptyState('اكتب اسمًا أو رقمًا قوميًا ثم اضغط «افحص».', null, { compact: true, icon: 'search' }));
  loadRecent();

  const how = card({
    title: 'كيف يعمل الفحص؟',
    icon: 'info',
    body: h(
      'ul.v9p-how',
      h('li', 'يُفحص الاسم مقابل كل مستفيدي المؤسسة وكل الأطراف المسجلة في ملفات الاستشارات والملفات المستمرة.'),
      h('li', 'تُوحَّد صيغ الكتابة: «أحمد/احمد»، «فاطمة/فاطمه»، «عبد الله/عبدالله»، وتُحذف الألقاب مثل «السيدة» و«الحاج» و«أ.».'),
      h('li', '«تطابق الاسم» = نفس الاسم كاملًا، و«تشابه» = أحد الاسمين بداية الآخر (مثل الاسم الثنائي والرباعي). تطابق الرقم القومي هو الأقوى.'),
      h('li', 'يُجرى الفحص تلقائيًا عند تحويل طلب إلى ملف، وعند إضافة طرف لملف، وعند تسجيل الخصم في ملف مستمر — والتحذيرات لا توقف العمل.'),
      h('li', [icon('lock', { size: 14 }), ' النتائج للإدارة فقط ولا تظهر للمحامين.']),
    ),
  });

  return h(
    'div.v9p-page.v9p-conflicts',
    pageHeader({
      title: 'فحص تعارض المصالح',
      subtitle: 'قبل قبول ملف جديد أو تسجيل خصم: تأكد أن المؤسسة لا تمثل الطرف الآخر في ملف قائم.',
    }),
    h('div.detail-layout', h('div.detail-main', card({ title: 'فحص اسم', icon: 'search', body: h('div.stack', f.el, results) }), card({ title: 'آخر التنبيهات', subtitle: 'من الفحوص التلقائية والبحث اليدوي', icon: 'shieldCheck', body: recentBody })), h('div.detail-side', how)),
  );
}
