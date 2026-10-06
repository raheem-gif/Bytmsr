// صحة النظام والنسخ الاحتياطي — (الإصدار 9 — وحدة platform)
// جاهزية الإطلاق، الخادم وقاعدة البيانات والمرفقات والقرص، المهام الدورية، صندوق الصادر، التكاملات،
// النسخ الاحتياطي اليومي (VACUUM INTO) مع التنزيل، والتصدير الكامل .tar.gz لنقل المنصة إلى خادم جديد.

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, num, count, dateTime, relative } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  statCard,
  table,
  kv,
  badge,
  button,
  asyncButton,
  alertBox,
  formDialog,
  confirmDialog,
  confirmDanger,
  toast,
  icon,
  codeTag,
  ltr,
  errorState,
  emptyState,
} from '../../../lib/ui.js';

// ───────── تنسيقات ─────────

/** حجم بالبايت بوحدات عربية حتى الجيجابايت */
function bytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${num(v)} بايت`;
  const units = [
    [1024 ** 3, 'جيجابايت'],
    [1024 ** 2, 'ميجابايت'],
    [1024, 'كيلوبايت'],
  ];
  for (const [size, name] of units) {
    if (v >= size) return `${(v / size).toFixed(v / size >= 100 ? 0 : 1).replace(/\.0$/, '')} ${name}`;
  }
  return `${num(v)} بايت`;
}

/** مدة تشغيل: «يومين و3 ساعات»، «5 ساعات و12 دقيقة»، «4 دقائق» */
function uptime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86400);
  const hr = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return hr ? `${count(d, 'day')} و${count(hr, 'hour')}` : count(d, 'day');
  if (hr) return m ? `${count(hr, 'hour')} و${count(m, 'minute')}` : count(hr, 'hour');
  return m ? count(m, 'minute') : 'أقل من دقيقة';
}

function every(minutes) {
  const n = Number(minutes) || 0;
  if (n === 1440) return 'يوميًا';
  if (n % 1440 === 0) return `كل ${count(n / 1440, 'day')}`;
  if (n % 60 === 0) return n === 60 ? 'كل ساعة' : `كل ${count(n / 60, 'hour')}`;
  return `كل ${count(n, 'minute')}`;
}

function timeCell(iso) {
  if (!iso) return h('span.muted', '—');
  return h('time.nowrap', { datetime: iso, title: dateTime(iso) }, relative(iso));
}

const ENV_LABEL = { demo: 'تجريبية', production: 'إنتاج', development: 'تطوير' };
// أسباب تخطي المهمة الدورية (result.skipped)
const SKIP_REASON = {
  disabled: 'النسخ الاحتياطي التلقائي متوقف من الإعدادات؛ استخدم «نسخ احتياطي الآن» لنسخة يدوية',
  memory: 'قاعدة البيانات تعمل في الذاكرة',
  setup: 'المنصة في وضع الإعداد الأول',
};
const ENV_TONE = { demo: 'warning', production: 'success', development: 'info' };
const CHECK_STYLE = {
  ok: { tone: 'success', icon: 'checkCircle', text: 'جاهز' },
  info: { tone: 'info', icon: 'info', text: 'معلومة' },
  warning: { tone: 'warning', icon: 'alert', text: 'تنبيه' },
  danger: { tone: 'danger', icon: 'alert', text: 'عاجل' },
};

function jobStatus(j) {
  if (!j.last_started_at) return badge('لم تُشغَّل بعد', 'muted');
  const failed = j.last_error && (!j.last_ok_at || (j.last_finished_at && j.last_finished_at > j.last_ok_at));
  if (failed) return badge('فشل آخر تشغيل', 'danger', { icon: 'alert', title: j.last_error });
  if (!j.last_finished_at || j.last_finished_at < j.last_started_at) return badge('قيد التشغيل', 'info', { icon: 'clock' });
  return badge('ناجح', 'success', { icon: 'check' });
}

// ───────── الأقسام ─────────

function readiness(checks) {
  const order = { danger: 0, warning: 1, info: 2, ok: 3 };
  const sorted = [...checks].sort((a, b) => order[a.level] - order[b.level]);
  const issues = checks.filter((c) => c.level === 'danger' || c.level === 'warning').length;
  return card({
    title: 'جاهزية الإطلاق',
    icon: 'shieldCheck',
    subtitle: issues ? `${count(issues, ['بند واحد يحتاج انتباهًا', 'بندان يحتاجان انتباهًا', 'بنود تحتاج انتباهًا', 'بندًا يحتاج انتباهًا'])} قبل التشغيل الفعلي` : 'كل البنود الأساسية جاهزة',
    body: h(
      'ul.pf-checks',
      sorted.map((c) => {
        const st = CHECK_STYLE[c.level] || CHECK_STYLE.info;
        return h(
          'li.pf-check',
          { class: `is-${c.level}` },
          h('span.pf-check-icon', { class: `tone-${st.tone}` }, icon(st.icon, { size: 18, label: st.text })),
          h(
            'div.pf-check-body',
            h('div.pf-check-title', c.title),
            // اتجاه الفقرة عربي دائمًا (dir=auto كان يقلب الفقرة كلها إذا بدأت بمتغير بيئة إنجليزي)
            c.detail ? h('div.pf-check-detail', c.detail) : null,
          ),
          c.href ? button('فتح', { size: 'sm', variant: 'ghost', iconEnd: 'chevronLeft', href: c.href }) : null,
        );
      }),
    ),
  });
}

function stats(d) {
  const last = d.backups.last;
  return h(
    'div.stats-grid',
    statCard({ label: 'الإصدار', value: ltr(d.version), hint: ENV_LABEL[d.environment] ? `بيئة ${ENV_LABEL[d.environment]}` : d.environment, icon: 'shield', tone: 'primary' }),
    statCard({ label: 'مدة التشغيل', value: uptime(d.uptime_seconds), hint: `منذ ${dateTime(d.started_at)}`, icon: 'clock', tone: 'info' }),
    statCard({ label: 'قاعدة البيانات', value: bytes(d.db.size_bytes + d.db.wal_bytes), hint: d.db.wal_bytes ? `منها سجل WAL ${bytes(d.db.wal_bytes)}` : 'SQLite', icon: 'book', tone: 'primary' }),
    statCard({ label: 'المرفقات', value: bytes(d.uploads.bytes), hint: count(d.uploads.files, 'file'), icon: 'paperclip', tone: 'accent' }),
    statCard({
      label: 'المساحة الحرة على القرص',
      value: d.disk ? bytes(d.disk.free_bytes) : '—',
      hint: d.disk ? `من ${bytes(d.disk.total_bytes)}` : 'غير متاحة على هذا النظام',
      icon: 'download',
      tone: d.disk && d.disk.free_bytes < 1024 ** 3 ? 'danger' : 'success',
    }),
    statCard({
      label: 'آخر نسخة احتياطية',
      value: last ? relative(last.created_at) : 'لا توجد',
      hint: last ? bytes(last.size_bytes) : 'أنشئ نسخة الآن',
      icon: 'refresh',
      tone: d.backups.stale ? 'warning' : 'success',
      href: '#/system?focus=backups',
    }),
    statCard({
      label: 'رسائل صادرة فاشلة',
      value: num(d.outbox.failed),
      hint: d.outbox.queued ? `${count(d.outbox.queued, 'message')} في الانتظار` : 'لا رسائل في الانتظار',
      icon: 'message',
      tone: d.outbox.failed ? 'danger' : 'success',
      href: '#/automations?tab=outbox&status=failed',
    }),
  );
}

function serverCard(d) {
  return card({
    title: 'الخادم',
    icon: 'settings',
    body: kv([
      ['الإصدار', ltr(d.version)],
      ['البيئة', badge(ENV_LABEL[d.environment] || d.environment, ENV_TONE[d.environment] || 'neutral')],
      ['Node.js', ltr(d.node)],
      ['النظام', ltr(d.platform)],
      ['بدأ التشغيل', dateTime(d.started_at)],
      ['مدة التشغيل', uptime(d.uptime_seconds)],
      ['الذاكرة المستخدمة', bytes(d.memory?.rss_bytes)],
      ['المجدول', d.scheduler.enabled ? `كل ${count(d.scheduler.interval_seconds, 'second')}` : badge('متوقف', 'danger')],
      ['الإعداد الأول', d.setup?.completed_at ? `${dateTime(d.setup.completed_at)}${d.setup.method ? ` (${{ wizard: 'معالج الإعداد', env: 'متغيرات البيئة', cli: 'سطر الأوامر', demo: 'بيانات تجريبية' }[d.setup.method] || d.setup.method})` : ''}` : null],
    ]),
  });
}

function dbCard(d) {
  return card({
    title: 'قاعدة البيانات والسجلات',
    icon: 'book',
    body: h(
      'div.stack',
      kv([
        ['الملف', codeTag(d.db.file)],
        ['الحجم', bytes(d.db.size_bytes)],
        ['سجل WAL', bytes(d.db.wal_bytes)],
        ['وضع السجل', ltr(d.db.journal_mode)],
        ['صفحات فارغة قابلة للاسترداد', num(d.db.freelist_count)],
      ]),
      table({
        caption: 'عدد السجلات في الجداول الرئيسية',
        columns: [
          { key: 'label', label: 'الجدول' },
          { key: 'count', label: 'عدد السجلات', align: 'end', render: (r) => h('span.nowrap', num(r.count)) },
        ],
        rows: d.counts,
      }),
    ),
  });
}

function jobsCard(d, reload) {
  return card({
    title: 'المهام الدورية',
    icon: 'zap',
    subtitle: d.scheduler.enabled ? `يفحص المجدول المهام المستحقة كل ${count(d.scheduler.interval_seconds, 'second')}` : 'المجدول متوقف (SCHEDULER_INTERVAL_SECONDS=0)',
    flush: true,
    body: table({
      caption: 'المهام الدورية',
      className: 'pf-stack-table',
      empty: 'لا توجد مهام دورية مسجلة',
      columns: [
        { key: 'label', label: 'المهمة', render: (j) => h('div', h('div', j.label), codeTag(j.name, { className: 'pf-job-name' })) },
        { key: 'every', label: 'التكرار', render: (j) => every(j.every_minutes) },
        { key: 'last', label: 'آخر تشغيل', render: (j) => timeCell(j.last_started_at) },
        {
          key: 'status',
          label: 'الحالة',
          render: (j) => h('div.stack-sm', jobStatus(j), j.last_error ? h('span.pf-error-text', { dir: 'auto' }, j.last_error) : null),
        },
        { key: 'runs', label: 'مرات التشغيل', align: 'end', render: (j) => num(j.runs || 0) },
        {
          key: 'run',
          label: 'إجراء',
          render: (j) =>
            asyncButton(
              'تشغيل الآن',
              async () => {
                const r = await api.post(`/admin/system/jobs/${encodeURIComponent(j.name)}/run`);
                const skipped = r.ok && r.result && typeof r.result === 'object' ? r.result.skipped : null;
                if (skipped) toast(`لم تُنفذ «${j.label}»: ${SKIP_REASON[skipped] || skipped}`, 'warning', 6000);
                else toast(r.ok ? `تم تشغيل «${j.label}» بنجاح` : `فشل تشغيل «${j.label}»: ${r.error || ''}`, r.ok ? 'success' : 'danger');
                reload();
              },
              { size: 'sm', icon: 'refresh' },
            ),
        },
      ],
      rows: d.jobs,
    }),
  });
}

function outboxAndIntegrations(d) {
  const i = d.integrations;
  const testLine = (t) => (t ? badge(t.ok ? `آخر اختبار ناجح ${relative(t.tested_at)}` : `آخر اختبار فاشل ${relative(t.tested_at)}`, t.ok ? 'success' : 'danger') : badge('لم يُختبر', 'muted'));
  return h(
    'div.grid-2.pf-grid',
    card({
      title: 'صندوق الصادر',
      icon: 'send',
      body: h(
        'div.stack',
        kv([
          ['رسائل فاشلة', d.outbox.failed ? badge(count(d.outbox.failed, 'message'), 'danger') : badge('لا توجد', 'success')],
          ['في الانتظار', d.outbox.queued ? badge(count(d.outbox.queued, 'message'), 'warning') : badge('لا توجد', 'success')],
        ]),
        button('فتح صندوق الصادر', { icon: 'arrowLeft', variant: 'secondary', size: 'sm', href: '#/automations?tab=outbox&status=failed' }),
      ),
    }),
    card({
      title: 'التكاملات',
      icon: 'link',
      body: h(
        'div.stack',
        kv([
          ['واتساب', h('div.pf-badges', badge(i.whatsapp.label, i.whatsapp.live ? 'success' : 'muted'), testLine(i.whatsapp.last_test))],
          ['الذكاء الاصطناعي', h('div.pf-badges', badge(i.anthropic.label, i.anthropic.live ? 'success' : 'info'), testLine(i.anthropic.last_test))],
          ['مفتاح التشفير', badge(label('key_source', i.key_source), i.key_source === 'env' ? 'success' : i.key_source === 'file' ? 'warning' : 'danger')],
          ['رابط Webhook', h('code.pf-code', { dir: 'ltr' }, d.webhook_url)],
        ]),
        button('إدارة التكاملات', { icon: 'arrowLeft', variant: 'secondary', size: 'sm', href: '#/integrations' }),
      ),
    }),
  );
}

async function editBackupSettings(b, reload) {
  const res = await formDialog({
    title: 'إعدادات النسخ الاحتياطي',
    intro: 'تُنشأ نسخة تلقائية مرة كل يوم في مجلد النسخ على الخادم، ويُحذف الأقدم تلقائيًا بعد بلوغ العدد المحدد (يشمل ذلك النسخ اليدوية).',
    fields: [
      { name: 'enabled', type: 'checkbox', label: 'النسخ الاحتياطي اليومي التلقائي', text: 'تفعيل النسخ الاحتياطي اليومي التلقائي' },
      { name: 'retention', type: 'number', label: 'عدد النسخ المحتفظ بها', required: true, integer: true, min: 1, max: 365, suffix: 'نسخة', hint: 'من 1 إلى 365. الافتراضي 14 (أسبوعان).' },
    ],
    values: { enabled: b.enabled, retention: b.retention },
    onSubmit: (vals) => api.put('/admin/system/backup-settings', vals),
  });
  if (!res) return;
  toast('تم حفظ إعدادات النسخ الاحتياطي', 'success');
  reload();
}

function backupsCard(b, reload) {
  const download = (file) => {
    const a = button('تنزيل', { size: 'sm', variant: 'ghost', icon: 'download', href: `/api/admin/system/backups/${encodeURIComponent(file)}/download` });
    a.setAttribute('download', file);
    a.addEventListener('click', () => toast('بدأ التنزيل. احفظ الملف في مكان آمن ومشفر؛ فهو يحتوي على بيانات المستفيدين.', 'info', 5000));
    return a;
  };
  const del = (file) =>
    button('', {
      size: 'sm',
      variant: 'ghost',
      icon: 'trash',
      title: `حذف ${file}`,
      onClick: async () => {
        const ok = await confirmDanger({ title: 'حذف نسخة احتياطية', message: `سيُحذف الملف ${file} نهائيًا من الخادم. هل تريد المتابعة؟`, confirmLabel: 'حذف النسخة' });
        if (!ok) return;
        try {
          await api.del(`/admin/system/backups/${encodeURIComponent(file)}`);
          toast('تم حذف النسخة', 'success');
          reload();
        } catch (err) {
          toast(err.message, 'danger');
        }
      },
    });
  const lastNote = b.last
    ? b.stale
      ? alertBox(`آخر نسخة احتياطية أُنشئت ${relative(b.last.created_at)} (أكثر من ${count(b.stale_after_hours, 'hour')}). تأكد من عمل المجدول أو أنشئ نسخة الآن.`, 'warning', { title: 'النسخ الاحتياطي متأخر' })
      : null
    : alertBox('لا توجد أي نسخة احتياطية بعد. أنشئ نسخة الآن ثم نزّلها واحفظها خارج الخادم.', 'warning', { title: 'لا توجد نسخ احتياطية' });
  return card({
    title: 'النسخ الاحتياطي',
    icon: 'refresh',
    subtitle: h(
      'span',
      `${b.enabled ? 'تلقائي يوميًا' : 'التلقائي متوقف'} — يُحتفظ بآخر ${count(b.retention, ['نسخة واحدة', 'نسختين', 'نسخ', 'نسخة'])} في المجلد `,
      codeTag(b.directory),
    ),
    actions: h(
      'div.pf-card-actions',
      button('الإعدادات', { size: 'sm', variant: 'ghost', icon: 'settings', onClick: () => editBackupSettings(b, reload) }),
      b.available
        ? asyncButton(
            'نسخ احتياطي الآن',
            async () => {
              const r = await api.post('/admin/system/backups');
              toast(`تم إنشاء النسخة ${r.file} (${bytes(r.size_bytes)})`, 'success');
              reload();
            },
            { size: 'sm', variant: 'primary', icon: 'download' },
          )
        : null,
    ),
    body: h(
      'div.stack',
      { id: 'backups' },
      !b.available ? alertBox('قاعدة البيانات تعمل في الذاكرة؛ النسخ الاحتياطي غير متاح.', 'info') : null,
      !b.enabled ? alertBox('النسخ الاحتياطي اليومي التلقائي متوقف. فعّله من «الإعدادات».', 'warning') : null,
      lastNote,
      b.items.length
        ? table({
            caption: 'النسخ الاحتياطية المتاحة على الخادم',
            className: 'pf-stack-table',
            columns: [
              { key: 'file', label: 'الملف', render: (r) => codeTag(r.file) },
              { key: 'created_at', label: 'التاريخ', render: (r) => h('div', h('div.nowrap', dateTime(r.created_at)), h('span.pf-muted', relative(r.created_at))) },
              { key: 'kind', label: 'النوع', render: (r) => (r.kind ? badge(label('backup_kind', r.kind), r.kind === 'manual' ? 'info' : r.kind === 'auto' ? 'neutral' : 'warning') : badge('غير مسجلة', 'muted')) },
              { key: 'size_bytes', label: 'الحجم', align: 'end', render: (r) => h('span.nowrap', bytes(r.size_bytes)) },
              { key: 'integrity', label: 'فحص السلامة', render: (r) => (r.integrity === 'ok' ? badge('سليمة', 'success', { icon: 'check' }) : r.integrity ? badge('بها خلل', 'danger', { title: r.integrity }) : badge('—', 'muted')) },
              { key: 'actions', label: 'إجراءات', render: (r) => h('div.pf-row-actions', download(r.file), del(r.file)) },
            ],
            rows: b.items,
          })
        : emptyState('لا توجد نسخ احتياطية محفوظة على الخادم بعد.', null, { compact: true, icon: 'refresh' }),
      b.items.length ? h('p.pf-muted', `الإجمالي: ${count(b.items.length, ['نسخة واحدة', 'نسختين', 'نسخ', 'نسخة'])} بحجم ${bytes(b.total_bytes)}.`) : null,
    ),
  });
}

function exportCard(keySource) {
  let includeKey = false;
  const keyToggle =
    keySource === 'file'
      ? h(
          'label.check.check-single',
          h('input', { type: 'checkbox', onChange: (e) => (includeKey = e.target.checked) }),
          h('span', 'تضمين مفتاح التشفير data/.secret-key (لازم لنقل أسرار التكاملات المحفوظة إلى الخادم الجديد)'),
        )
      : null;
  const start = async () => {
    const ok = await confirmDialog({
      title: 'تصدير كامل للمنصة',
      message: `سيُنزَّل أرشيف يضم قاعدة البيانات كاملة وكل المستندات المرفوعة${includeKey ? ' ومفتاح التشفير' : ''}، أي كل بيانات المستفيدين. احفظه في مكان مشفر واحذفه بعد إتمام النقل. يُسجَّل التصدير في سجل الأمان.`,
      confirmLabel: 'بدء التنزيل',
    });
    if (!ok) return;
    const a = h('a', { href: `/api/admin/system/export${includeKey ? '?include_key=1' : ''}`, download: '' });
    document.body.append(a);
    a.click();
    a.remove();
    toast('بدأ تجهيز الأرشيف وتنزيله؛ قد يستغرق ذلك دقيقة مع كثرة المرفقات.', 'info', 6000);
  };
  return card({
    title: 'التصدير الكامل ونقل الخادم',
    icon: 'upload',
    body: h(
      'div.stack',
      h(
        'p',
        'أرشيف ',
        codeTag('.tar.gz'),
        ' يحتوي على لقطة متسقة من قاعدة البيانات، ومجلد المستندات المرفوعة، وملف ',
        codeTag('manifest.json'),
        ' بتجزئة sha256 لكل ملف للتحقق من سلامة النقل. يُستعاد على الخادم الجديد بالأمر ',
        codeTag('npm run restore -- <الملف> --yes'),
        ' (راجع DEPLOY.md).',
      ),
      keySource === 'env'
        ? alertBox('مفتاح التشفير مضبوط من APP_SECRET: اضبط نفس القيمة على الخادم الجديد حتى تبقى أسرار التكاملات صالحة.', 'info')
        : null,
      keyToggle,
      h('div', button('تنزيل التصدير الكامل', { variant: 'primary', icon: 'download', onClick: start })),
    ),
  });
}

// ───────── الصفحة ─────────

export default async function render(ctx) {
  const host = h('div.page.pf-page');
  async function load() {
    let d;
    let b;
    try {
      [d, b] = await Promise.all([api.get('/admin/system/health'), api.get('/admin/system/backups')]);
    } catch (err) {
      mount(host, pageHeader({ title: 'صحة النظام والنسخ الاحتياطي' }), errorState(err, load));
      return;
    }
    mount(
      host,
      pageHeader({
        title: 'صحة النظام والنسخ الاحتياطي',
        subtitle: 'حالة الخادم وقاعدة البيانات والمهام الدورية والتكاملات، والنسخ الاحتياطي والتصدير الكامل.',
        meta: h('div.pf-badges', badge(`الإصدار ${d.version}`, 'primary'), badge(`بيئة ${ENV_LABEL[d.environment] || d.environment}`, ENV_TONE[d.environment] || 'neutral'), h('span.pf-muted', `حُدّثت ${dateTime(new Date().toISOString())}`)),
        actions: button('تحديث', { icon: 'refresh', variant: 'ghost', onClick: load }),
      }),
      h(
        'div.stack-lg',
        readiness(d.checks),
        stats(d),
        backupsCard(b, load),
        h('div.grid-2.pf-grid', serverCard(d), dbCard(d)),
        jobsCard(d, load),
        outboxAndIntegrations(d),
        exportCard(d.integrations.key_source),
      ),
    );
    if (ctx && ctx.query && ctx.query.focus === 'backups') {
      requestAnimationFrame(() => document.getElementById('backups')?.scrollIntoView({ block: 'start' }));
    }
  }
  await load();
  return frag(host);
}
