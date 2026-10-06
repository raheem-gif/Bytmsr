// حسابي والأمان — لكل المستخدمين (الإدارة والمحامين): البيانات الشخصية، كلمة المرور، التحقق بخطوتين،
// الجلسات النشطة على الأجهزة، وآخر أحداث الأمان على الحساب.
// (الإصدار 9 — وحدة accounts)
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { label, dateTime, relative, count, num, hours } from '../../lib/fmt.js';
import {
  pageHeader,
  card,
  form,
  kv,
  badge,
  button,
  asyncButton,
  alertBox,
  modal,
  formDialog,
  confirmDanger,
  toast,
  icon,
  codeTag,
  loading,
  errorState,
  emptyState,
  timeline,
} from '../../lib/ui.js';
import { attachStrength, passwordProblem, PASSWORD_HINT } from '../components/password.js';
import { twoFactorWizard, recoveryCodesPanel } from '../components/two-factor.js';

// تُستخدم بعد حرف الجر («سُجّل الخروج من جلستين»)
const SESSION_FORMS = ['جلسة واحدة', 'جلستين', 'جلسات', 'جلسة'];
const SEVERITY_TONE = { info: 'neutral', warning: 'warning', critical: 'danger' };

function fieldError(name, msg) {
  const e = new Error(msg);
  e.details = { fields: { [name]: msg } };
  return e;
}

export default async function render(ctx) {
  let data = await api.get('/account');
  const page = h('div.acc-page');

  // ───────────── البيانات الشخصية ─────────────
  function profileCard() {
    const u = data.user;
    const f = form(
      [
        { name: 'name', label: 'الاسم', required: true, minLength: 3, maxLength: 120, readonly: !data.editable.name, hint: data.editable.name ? null : 'يُعدَّل اسم المحامي من الإدارة لارتباطه ببيانات القيد والاتفاق' },
        { name: 'email', label: 'البريد الإلكتروني', type: 'email' },
        { name: 'phone', label: 'رقم الموبايل', type: 'phone', hint: u.role === 'lawyer' ? 'للتواصل الداخلي مع الإدارة فقط' : null },
      ],
      {
        values: { name: u.name, email: u.email, phone: u.phone },
        submitLabel: 'حفظ البيانات',
        submitIcon: 'check',
        onSubmit: async (v) => {
          const payload = { email: v.email || null, phone: v.phone || null };
          if (data.editable.name) payload.name = v.name;
          data = await api.patch('/account', payload);
          f.setValues({ name: data.user.name, email: data.user.email, phone: data.user.phone });
          toast('حُفظت بياناتك', 'success');
          if (ctx.refreshShell) ctx.refreshShell();
        },
      },
    );
    return card({
      title: 'البيانات الشخصية',
      icon: 'user',
      body: h(
        'div.stack',
        kv(
          [
            ['اسم المستخدم', codeTag(u.username)],
            ['الدور', label('user_role', u.role)],
            ['تاريخ إنشاء الحساب', dateTime(u.created_at)],
            ['آخر دخول', u.last_login_at ? h('time', { datetime: u.last_login_at, title: dateTime(u.last_login_at) }, relative(u.last_login_at)) : null],
            u.confidentiality_pledged_at ? ['التعهد بسرية بيانات المستفيدين', `أُقرّ في ${dateTime(u.confidentiality_pledged_at)}`] : null,
          ],
          { columns: 2 },
        ),
        f.el,
      ),
    });
  }

  // ───────────── كلمة المرور ─────────────
  function passwordCard() {
    const u = data.user;
    const f = form(
      [
        { name: 'current_password', label: 'كلمة المرور الحالية', type: 'password', required: true, autocomplete: 'current-password' },
        { name: 'new_password', label: 'كلمة المرور الجديدة', type: 'password', required: true, minLength: 8, autocomplete: 'new-password', hint: PASSWORD_HINT },
        { name: 'new_password_confirm', label: 'تأكيد كلمة المرور الجديدة', type: 'password', required: true, autocomplete: 'new-password' },
      ],
      {
        columns: 1,
        submitLabel: 'تغيير كلمة المرور',
        submitIcon: 'lock',
        onSubmit: async (v, api_) => {
          const p = passwordProblem(v.new_password, u.username);
          if (p) throw fieldError('new_password', p);
          if (v.new_password !== v.new_password_confirm) throw fieldError('new_password_confirm', 'كلمتا المرور غير متطابقتين');
          const r = await api.post('/account/password', v);
          api_.setValues({ current_password: '', new_password: '', new_password_confirm: '' });
          toast(r.other_sessions_revoked ? `غُيّرت كلمة المرور وسُجّل خروجك من ${count(r.other_sessions_revoked, SESSION_FORMS)} على أجهزة أخرى` : 'غُيّرت كلمة المرور بنجاح', 'success', 5000);
          await refresh();
        },
      },
    );
    attachStrength(f, 'new_password', () => u.username);
    return card({
      title: 'كلمة المرور',
      icon: 'lock',
      subtitle: u.password_changed_at ? `آخر تغيير: ${dateTime(u.password_changed_at)}` : 'لم تُغيَّر كلمة المرور من هذه الصفحة بعد',
      body: h('div.stack', h('p.small.muted', 'عند تغيير كلمة المرور يُسجَّل خروجك تلقائيًا من كل الأجهزة الأخرى.'), f.el),
    });
  }

  // ───────────── التحقق بخطوتين ─────────────
  function twoFactorCard() {
    const tf = data.two_factor;
    const host = h('div.stack');
    const policyLocked = data.user.role === 'admin' && data.policy.require_2fa_admins;
    function drawStatus() {
      if (!tf.enabled) {
        mount(
          host,
          h('p.acc-lead', 'التحقق بخطوتين يحمي حسابك حتى لو عرف أحد كلمة مرورك: عند كل دخول يُطلب رمز مؤقت من تطبيق مصادقة على هاتفك.'),
          data.user.role === 'admin' ? alertBox('حسابك بدور «إدارة النظام» ويطّلع على بيانات المستفيدين وهواتفهم؛ تفعيل التحقق بخطوتين ضروري لحمايتها.', 'warning') : null,
          h('div.acc-actions-row', button('تفعيل التحقق بخطوتين', { variant: 'primary', icon: 'shieldCheck', onClick: startWizard })),
        );
        return;
      }
      const low = tf.recovery_remaining <= 3;
      mount(
        host,
        h('div.acc-status-line', badge('مفعّل', 'success', { icon: 'shieldCheck' }), h('span.small.muted', `منذ ${dateTime(tf.enabled_at)}`)),
        kv([
          ['تطبيق المصادقة', 'رمز من ستة أرقام يتغير كل 30 ثانية'],
          ['رموز الاسترداد المتبقية', h('span', { class: low ? 'acc-text-warning' : null }, `${num(tf.recovery_remaining)} من ${num(tf.recovery_total)}`)],
        ]),
        low && alertBox('اقتربت رموز الاسترداد من النفاد. أصدر رموزًا جديدة واحفظها في مكان آمن.', 'warning'),
        h(
          'div.acc-actions-row',
          button('إصدار رموز استرداد جديدة', { variant: 'secondary', size: 'sm', icon: 'refresh', onClick: regenerate }),
          button('إلغاء التحقق بخطوتين', { variant: 'ghost', size: 'sm', icon: 'x', disabled: policyLocked, onClick: disable }),
        ),
        policyLocked && h('p.small.muted', 'سياسة المؤسسة تلزم حسابات «إدارة النظام» بالتحقق بخطوتين، لذا لا يمكن إلغاؤه.'),
      );
    }
    function startWizard() {
      mount(
        host,
        twoFactorWizard({
          username: data.user.username,
          askPassword: true,
          onCancel: drawStatus,
          onEnabled: async () => {
            toast('فُعّل التحقق بخطوتين لحسابك', 'success');
            await refresh();
          },
        }),
      );
    }
    function confirmFields() {
      return [
        { name: 'password', label: 'كلمة المرور الحالية', type: 'password', required: true, autocomplete: 'current-password' },
        { name: 'code', label: 'رمز التحقق من التطبيق أو رمز استرداد', required: true, ltr: true, autocomplete: 'one-time-code', maxLength: 20 },
      ];
    }
    function regenerate() {
      formDialog({
        title: 'إصدار رموز استرداد جديدة',
        intro: 'ستُبطل كل رموز الاسترداد السابقة فورًا وتُصدر عشرة رموز جديدة.',
        submitLabel: 'إصدار الرموز',
        fields: confirmFields(),
        onSubmit: (v) => api.post('/account/2fa/recovery-codes', v),
      }).then((res) => {
        if (!res) return;
        const m = modal({
          title: 'رموز الاسترداد الجديدة',
          size: 'md',
          dismissible: false,
          body: recoveryCodesPanel(res.recovery_codes, { username: data.user.username, onDone: () => m.close('done') }),
          onClose: () => refresh(),
        });
      });
    }
    function disable() {
      formDialog({
        title: 'إلغاء التحقق بخطوتين',
        intro: 'سيصبح الدخول إلى حسابك بكلمة المرور وحدها. لا يُنصح بذلك إلا مؤقتًا (مثل تغيير الهاتف ثم إعادة التفعيل).',
        submitLabel: 'إلغاء التحقق بخطوتين',
        fields: confirmFields(),
        onSubmit: (v) => api.post('/account/2fa/disable', v),
      }).then(async (res) => {
        if (!res) return;
        toast('أُلغي التحقق بخطوتين لحسابك', 'warning');
        await refresh();
      });
    }
    drawStatus();
    return card({ title: 'التحقق بخطوتين', icon: 'shieldCheck', body: host, className: 'acc-2fa-card' });
  }

  // ───────────── الجلسات ─────────────
  function sessionsCard() {
    const host = h('div', loading());
    let revokeOthers = null;
    async function load() {
      try {
        const res = await api.get('/account/sessions');
        const others = res.items.filter((s) => !s.current);
        revokeOthers.hidden = !others.length;
        mount(
          host,
          h('p.small.muted', `يُسجَّل الخروج تلقائيًا بعد ${hours(res.idle_hours)} من عدم النشاط، وبعد ${hours(res.max_hours)} من الدخول أيًا كان النشاط.`),
          res.items.length
            ? h(
                'ul.acc-sessions',
                res.items.map((s) =>
                  h(
                    'li.acc-session',
                    { class: s.current && 'is-current' },
                    h('span.acc-session-icon', icon(s.mobile ? 'phone' : 'globe', { size: 20 })),
                    h(
                      'div.acc-session-body',
                      h('div.acc-session-title', h('span', s.device), s.current ? badge('هذا الجهاز', 'primary') : null, s.auth_method !== 'password_only' ? badge(label('auth_method', s.auth_method), 'neutral') : null),
                      h(
                        'div.acc-session-meta',
                        s.ip && h('span', 'العنوان: ', h('span.ltr', { dir: 'ltr' }, s.ip)),
                        h('span', 'الدخول: ', h('time', { datetime: s.created_at }, dateTime(s.created_at))),
                        h('span', 'آخر نشاط: ', h('time', { datetime: s.last_seen_at, title: dateTime(s.last_seen_at) }, relative(s.last_seen_at))),
                      ),
                    ),
                    !s.current &&
                      asyncButton('إنهاء', async () => {
                        const ok = await confirmDanger({ title: 'إنهاء الجلسة', message: `سيُسجَّل الخروج من «${s.device}» فورًا.`, confirmLabel: 'إنهاء الجلسة' });
                        if (!ok) return;
                        await api.del(`/account/sessions/${encodeURIComponent(s.id)}`);
                        toast('أُنهيت الجلسة', 'success');
                        await load();
                      }, { variant: 'ghost', size: 'sm', icon: 'logout', ariaLabel: `إنهاء الجلسة على ${s.device}` }),
                  ),
                ),
              )
            : emptyState('لا توجد جلسات نشطة', null, { compact: true }),
        );
      } catch (err) {
        mount(host, errorState(err, load));
      }
    }
    revokeOthers = asyncButton('تسجيل الخروج من كل الأجهزة الأخرى', async () => {
      const ok = await confirmDanger({
        title: 'تسجيل الخروج من الأجهزة الأخرى',
        message: 'ستبقى مسجّلًا على هذا الجهاز فقط، ويُطلب الدخول من جديد على أي جهاز آخر. ويتوقف أيضًا رابط اشتراك التقويم إن كنت أصدرته، ويمكنك إصدار رابط جديد من صفحة التقويم.',
        confirmLabel: 'تسجيل الخروج منها',
      });
      if (!ok) return;
      const r = await api.post('/account/sessions/revoke-others');
      toast(`${r.revoked ? `سُجّل الخروج من ${count(r.revoked, SESSION_FORMS)}` : 'لا توجد جلسات أخرى'}${r.calendar_feed_revoked ? '، وأُلغي رابط التقويم' : ''}`, 'success');
      await load();
    }, { variant: 'secondary', size: 'sm', icon: 'logout' });
    revokeOthers.hidden = true;
    load();
    return card({ title: 'الأجهزة والجلسات النشطة', icon: 'globe', actions: revokeOthers, body: host });
  }

  // ───────────── النشاط الأخير ─────────────
  function activityCard() {
    const host = h('div', loading());
    (async () => {
      try {
        const { items } = await api.get('/account/activity');
        mount(
          host,
          timeline(
            items.map((e) => ({
              time: e.created_at,
              title: e.type_label,
              body: [e.summary, e.ip ? ` — ${e.ip}` : ''].join(''),
              tone: SEVERITY_TONE[e.severity] || 'neutral',
              icon: e.type.startsWith('auth.login') ? 'user' : e.type.includes('2fa') ? 'shield' : e.type.includes('password') ? 'lock' : 'dot',
            })),
            { empty: 'لا توجد أحداث أمان مسجلة على حسابك بعد' },
          ),
        );
      } catch (err) {
        mount(host, errorState(err));
      }
    })();
    return card({ title: 'آخر أحداث الأمان على حسابك', subtitle: 'إن لاحظت دخولًا لا تعرفه فغيّر كلمة المرور فورًا وأبلغ الإدارة', icon: 'clock', body: host });
  }

  async function refresh() {
    data = await api.get('/account');
    draw();
  }

  function draw() {
    const tf = data.two_factor;
    mount(
      page,
      pageHeader({
        title: 'حسابي والأمان',
        subtitle: 'بياناتك، وكلمة المرور، والتحقق بخطوتين، والأجهزة التي سجّلت الدخول منها.',
        meta: [
          badge(label('user_role', data.user.role), 'primary'),
          tf.enabled ? badge('التحقق بخطوتين مفعّل', 'success', { icon: 'shieldCheck' }) : badge('التحقق بخطوتين غير مفعّل', data.user.role === 'admin' ? 'warning' : 'muted', { icon: 'shield' }),
          badge(`الجلسات النشطة: ${num(data.sessions_count)}`, 'neutral', { icon: 'globe' }),
        ],
      }),
      tf.enabled && tf.recovery_remaining === 0 ? alertBox('نفدت رموز الاسترداد. أصدر رموزًا جديدة من بطاقة التحقق بخطوتين حتى لا تفقد الوصول إلى حسابك إذا فقدت هاتفك.', 'danger') : null,
      h('div.acc-grid', h('div.acc-col', profileCard(), passwordCard()), h('div.acc-col', twoFactorCard(), sessionsCard(), activityCard())),
    );
  }
  draw();
  return page;
}

