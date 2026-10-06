// أطراف الملف (الخصوم والأطراف ذات الصلة والشهود) مع نتيجة فحص تعارض المصالح لكل طرف.
// التحذيرات لا تمنع العمل: الإدارة تراجعها وتقرر. (الإصدار 9 — وحدة practice)
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { label, options, toLatinDigits } from '../../lib/fmt.js';
import { card, button, badge, icon, codeTag, emptyState, loading, errorState, formDialog, confirmDanger, toast, errorMessage } from '../../lib/ui.js';

const LEVEL_TONE = { high: 'danger', review: 'warning', info: 'info' };
const LEVEL_ICON = { high: 'alert', review: 'flag', info: 'info' };

/** سطر تطابق واحد مع رابط للعميل أو الملف */
export function matchItem(m) {
  let target;
  if (m.target === 'client' && m.client) {
    target = h('a', { href: `#/clients/${m.client.id}` }, m.client.name || 'عميل', ' ', codeTag(m.client.code));
  } else if (m.party) {
    const p = m.party;
    const href = p.matter_id ? `#/matters/${p.matter_id}` : p.case_id ? `#/cases/${p.case_id}` : null;
    const code = p.matter_code || p.case_code;
    target = h('span', `«${p.name}» (${label('party_role', p.role)}) في `, href ? h('a', { href }, codeTag(code)) : codeTag(code));
  }
  return h(
    'li.v9p-match',
    { class: `is-${m.level}` },
    h('span.v9p-match-icon', { 'aria-hidden': 'true' }, icon(LEVEL_ICON[m.level] || 'info', { size: 16 })),
    h(
      'div.v9p-match-body',
      h('div.row', badge(label('conflict_level', m.level), LEVEL_TONE[m.level] || 'neutral'), badge(label('conflict_match', m.match), 'neutral')),
      h('div.v9p-match-reason', m.reason),
      target && h('div.small', target),
    ),
  );
}

export function matchList(matches) {
  return h('ul.v9p-matches', { 'aria-label': 'نتائج فحص تعارض المصالح' }, matches.map(matchItem));
}

function partyFields({ lockRole = false } = {}) {
  return [
    // الخصم المأخوذ من بيانات الدعوى: صفته ثابتة، ويُحدَّث اسمه في بيانات الملف المستمر أيضًا
    !lockRole && { name: 'role', label: 'صفة الطرف', type: 'select', required: true, placeholder: false, options: options('party_role') },
    { name: 'name', label: 'الاسم كاملًا', required: true, maxLength: 150, hint: 'اكتب الاسم الرباعي إن أمكن لدقة الفحص.' },
    { name: 'national_id', label: 'الرقم القومي (اختياري)', ltr: true, maxLength: 14, hint: '14 رقمًا يبدأ بـ 2 أو 3' },
    { name: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2, maxLength: 1000 },
  ].filter(Boolean);
}

function checkNid(v) {
  const nid = toLatinDigits(v.national_id || '').replace(/\s/g, '');
  if (nid && !/^[23]\d{13}$/.test(nid)) {
    const err = new Error('الرقم القومي يجب أن يتكون من 14 رقمًا ويبدأ بـ 2 أو 3');
    err.details = { national_id: 'الرقم القومي يجب أن يتكون من 14 رقمًا ويبدأ بـ 2 أو 3' };
    throw err;
  }
  return nid || null;
}

/**
 * بطاقة أطراف الملف. caseId أو matterId.
 * @returns {HTMLElement}
 */
export function partiesCard({ caseId = null, matterId = null, readOnly = false } = {}) {
  const base = matterId ? `/admin/matters/${matterId}/parties` : `/admin/cases/${caseId}/parties`;
  const body = h('div.v9p-parties', loading());
  const addBtn = !readOnly && button('إضافة طرف', { size: 'sm', icon: 'userPlus', onClick: () => edit(null) });
  const el = card({
    title: 'أطراف الملف وتعارض المصالح',
    subtitle: 'الخصوم والأطراف ذات الصلة — يُفحص كل اسم مقابل كل العملاء وأطراف الملفات الأخرى',
    icon: 'shieldCheck',
    actions: addBtn,
    body,
    className: 'v9p-parties-card',
  });
  let data = null;

  async function load() {
    try {
      data = await api.get(base);
      render();
    } catch (err) {
      mount(body, errorState(err, load));
    }
  }

  function partyRow(p) {
    const worst = p.matches[0]?.level;
    return h(
      'li.v9p-party',
      { class: worst && `has-${worst}` },
      h(
        'div.v9p-party-head',
        h('div.v9p-party-name', h('strong', p.name), ' ', badge(label('party_role', p.role), p.role === 'opponent' ? 'accent' : 'neutral'), p.origin === 'matter_opponent' && badge('من بيانات الدعوى', 'muted')),
        !readOnly &&
          h(
            'div.row',
            button('', { size: 'sm', variant: 'ghost', icon: 'edit', title: `تعديل بيانات «${p.name}»`, onClick: () => edit(p) }),
            // الخصم المأخوذ من بيانات الدعوى يُحذف من حقل «الخصم» في الملف المستمر لا من هنا
            p.origin !== 'matter_opponent' && button('', { size: 'sm', variant: 'ghost', icon: 'trash', title: `حذف «${p.name}» من أطراف الملف`, onClick: () => remove(p) }),
          ),
      ),
      p.national_id && h('div.small.muted', 'الرقم القومي: ', h('span.ltr', { dir: 'ltr' }, `••••${p.national_id.slice(-4)}`)),
      p.notes && h('div.small', p.notes),
      p.matches.length
        ? matchList(p.matches)
        : h('div.v9p-clear', icon('checkCircle', { size: 15 }), h('span', 'لا يوجد تطابق مع عملاء المؤسسة أو أطراف ملفات أخرى')),
    );
  }

  function render() {
    const parts = [];
    const cc = data.client_check;
    if (cc && cc.matches.length) {
      parts.push(
        h(
          'div.v9p-client-check',
          h('div.v9p-subhead', icon('user', { size: 16 }), h('span', `صاحب الملف «${cc.client.name || cc.client.code}» مقابل أطراف الملفات الأخرى`)),
          matchList(cc.matches),
        ),
      );
    }
    if (!data.items.length) {
      parts.push(
        emptyState(
          readOnly ? 'لم يُسجَّل أي طرف لهذا الملف.' : 'سجّل الخصم والأطراف ذات الصلة ليُفحص تعارض المصالح تلقائيًا.',
          addBtn ? button('إضافة طرف', { size: 'sm', variant: 'primary', icon: 'userPlus', onClick: () => edit(null) }) : null,
          { compact: true, icon: 'users' },
        ),
      );
    } else parts.push(h('ul.v9p-party-list', data.items.map(partyRow)));
    mount(body, parts);
  }

  async function edit(p) {
    const fromMatter = !!p && p.origin === 'matter_opponent';
    const res = await formDialog({
      title: p ? `تعديل بيانات الطرف «${p.name}»` : 'إضافة طرف في الملف',
      intro: fromMatter
        ? 'هذا هو الخصم المسجل في بيانات الدعوى: تعديل اسمه هنا يحدّث حقل «الخصم» في الملف المستمر أيضًا، ثم يُعاد فحص تعارض المصالح.'
        : 'يُفحص الاسم (بكل صيغ كتابته العربية) والرقم القومي مقابل كل عملاء المؤسسة وأطراف ملفاتها، وتُسجل النتيجة في سجل الملف.',
      fields: partyFields({ lockRole: fromMatter }),
      values: p ? { role: p.role, name: p.name, national_id: p.national_id, notes: p.notes } : { role: 'opponent' },
      onSubmit: async (v) => {
        const nid = checkNid(v);
        const payload = { name: v.name, national_id: nid, notes: v.notes || null };
        if (!fromMatter) payload.role = v.role;
        return p ? api.patch(`/admin/parties/${p.id}`, payload) : api.post(base, payload);
      },
    });
    if (!res) return;
    const high = (res.matches || []).filter((m) => m.level === 'high').length;
    if (high) toast(`تنبيه: تعارض مصالح محتمل للطرف «${res.name}» — راجع التفاصيل`, 'warning', 8000);
    else toast(res.matches?.length ? 'حُفظ الطرف — توجد تطابقات للمراجعة' : 'حُفظ الطرف — لا يوجد تعارض', 'success');
    await load();
  }

  async function remove(p) {
    const ok = await confirmDanger({ title: 'حذف طرف من الملف', message: `سيُحذف «${p.name}» من أطراف الملف ولن يدخل في فحوص تعارض المصالح القادمة. هل تريد المتابعة؟`, confirmLabel: 'حذف الطرف' });
    if (!ok) return;
    try {
      await api.del(`/admin/parties/${p.id}`);
      toast('حُذف الطرف', 'success');
      await load();
    } catch (err) {
      toast(errorMessage(err), 'danger');
    }
  }

  load();
  return el;
}
