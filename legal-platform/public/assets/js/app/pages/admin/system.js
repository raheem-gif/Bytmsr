// صحة النظام والنسخ الاحتياطي — (الإصدار 9 — وحدة platform)
// جاهزية الإطلاق، الخادم وقاعدة البيانات والمرفقات والقرص، المهام الدورية، صندوق الصادر، التكاملات،
// النسخ الاحتياطي اليومي (VACUUM INTO) مع التنزيل، والتصدير الكامل .tar.gz لنقل المنصة إلى خادم جديد.
// v12 media (MD-11): بطاقة «المستندات والصوت» (SYS-01…SYS-08): الأدوات وإصداراتها، الطابور، «شغّل الآن»، والاستكمال.

import { h, frag, mount } from '../../../lib/h.js';
import { api, downloadFile } from '../../../lib/api.js';
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
  setup: 'المنصة في وضع الإعداد الأول؛ تُنفذ المهمة فور اكتمال الإعداد',
};
// الوصف المختصر في شارة الحالة: «تُخطّي (وضع الإعداد)»
const SKIP_SHORT = {
  disabled: 'النسخ التلقائي متوقف',
  memory: 'قاعدة بيانات في الذاكرة',
  setup: 'وضع الإعداد',
};
const ENV_TONE = { demo: 'warning', production: 'success', development: 'info' };
const STATE_OF = { ok: 'ok', info: 'info', warning: 'warn', danger: 'bad' };
const CHECK_STYLE = {
  ok: { tone: 'success', icon: 'checkCircle', text: 'جاهز' },
  info: { tone: 'info', icon: 'info', text: 'معلومة' },
  warning: { tone: 'warning', icon: 'alert', text: 'تنبيه' },
  danger: { tone: 'danger', icon: 'alert', text: 'عاجل' },
};

/** حالة آخر تشغيل لمهمة دورية: { text, tone, icon, title } */
export function jobStatusInfo(j) {
  const failed = j.last_error && (!j.last_ok_at || (j.last_finished_at && j.last_finished_at > j.last_ok_at));
  if (failed) return { text: 'فشل آخر تشغيل', tone: 'danger', icon: 'alert', title: j.last_error };
  if (j.last_started_at && (!j.last_finished_at || j.last_finished_at < j.last_started_at)) return { text: 'قيد التشغيل', tone: 'info', icon: 'clock' };
  // مهمة لم تعمل فعلًا (وضع الإعداد، النسخ التلقائي متوقف…): ليست «ناجحة»
  const skipped = j.last_finished_at && j.last_result && typeof j.last_result === 'object' ? j.last_result.skipped : null;
  if (skipped) return { text: `تُخطّي (${SKIP_SHORT[skipped] || 'لم تُنفذ'})`, tone: 'warning', icon: 'info', title: SKIP_REASON[skipped] || '' };
  if (!j.last_started_at) return { text: 'لم تُشغَّل بعد', tone: 'muted' };
  return { text: 'ناجح', tone: 'success', icon: 'check' };
}

function jobStatus(j) {
  const st = jobStatusInfo(j);
  return badge(st.text, st.tone, { icon: st.icon, title: st.title || undefined });
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
          // v12 media (H-M10): رمزا تنبيهي الذاكرة والقرص (SYS-09، SYS-10)
          { class: `is-${c.level}`, tag: c.key === 'media_memory' ? 'SYS-09' : c.key === 'media_disk' ? 'SYS-10' : undefined },
          // v12 gate (V-25، K12-28): حالة البند نقطة ملونة وكلمة، لا أيقونة في دائرة ملونة
          h('span.state.pf-check-state', { class: `state--${STATE_OF[c.level] || 'info'}` }, st.text),
          h(
            'div.pf-check-body',
            h('div.pf-check-title', c.title),
            // اتجاه الفقرة عربي دائمًا (dir=auto كان يقلب الفقرة كلها إذا بدأت بمتغير بيئة إنجليزي)
            c.detail ? h('div.pf-check-detail', c.detail) : null,
          ),
          c.href ? button('فتح', { size: 'sm', variant: 'ghost', iconEnd: 'chevronLeft', href: c.href, tag: 'SYS-11' }) : null,
        );
      }),
    ),
    titleTag: 'SYS-12',
    tag: 'SYS-13',
  });
}

function stats(d) {
  const last = d.backups.last;
  return h(
    'div.stats-grid',
    statCard({ label: 'الإصدار', value: ltr(d.version), hint: ENV_LABEL[d.environment] ? `بيئة ${ENV_LABEL[d.environment]}` : d.environment, icon: 'shield', tone: 'primary', tag: 'SYS-14' }),
    statCard({ label: 'مدة التشغيل', value: uptime(d.uptime_seconds), hint: `منذ ${dateTime(d.started_at)}`, icon: 'clock', tone: 'info', tag: 'SYS-15' }),
    statCard({ label: 'قاعدة البيانات', value: bytes(d.db.size_bytes + d.db.wal_bytes), hint: d.db.wal_bytes ? `منها سجل WAL ${bytes(d.db.wal_bytes)}` : 'SQLite', icon: 'book', tone: 'primary', tag: 'SYS-16' }),
    statCard({ label: 'المرفقات', value: bytes(d.uploads.bytes), hint: count(d.uploads.files, 'file'), icon: 'paperclip', tone: 'accent', tag: 'SYS-17' }),
    statCard({
      label: 'المساحة الحرة على القرص',
      value: d.disk ? bytes(d.disk.free_bytes) : '—',
      hint: d.disk ? `من ${bytes(d.disk.total_bytes)}` : 'غير متاحة على هذا النظام',
      icon: 'download',
      tone: d.disk && d.disk.free_bytes < 1024 ** 3 ? 'danger' : 'success',
      tag: 'SYS-18',
    }),
    statCard({
      label: 'آخر نسخة احتياطية',
      value: last ? relative(last.created_at) : 'لا توجد',
      hint: last ? bytes(last.size_bytes) : 'أنشئ نسخة الآن',
      icon: 'refresh',
      tone: d.backups.stale ? 'warning' : 'success',
      href: '#/system?focus=backups',
      tag: 'SYS-19',
    }),
    statCard({
      label: 'رسائل صادرة فاشلة',
      value: num(d.outbox.failed),
      hint: d.outbox.queued ? `${count(d.outbox.queued, 'message')} في الانتظار` : 'لا رسائل في الانتظار',
      icon: 'message',
      tone: d.outbox.failed ? 'danger' : 'success',
      href: '#/automations?tab=outbox&status=failed',
      tag: 'SYS-20',
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
    titleTag: 'SYS-21',
    tag: 'SYS-22',
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
          { key: 'label', label: 'الجدول', tag: 'SYS-23' },
          { key: 'count', label: 'عدد السجلات', align: 'end', render: (r) => h('span.nowrap', num(r.count)), tag: 'SYS-24' },
        ],
        rows: d.counts,
        rowTag: 'SYS-25',
        tag: 'SYS-26',
      }),
    ),
    titleTag: 'SYS-27',
    tag: 'SYS-28',
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
        { key: 'label', label: 'المهمة', render: (j) => h('div', h('div', j.label), codeTag(j.name, { className: 'pf-job-name' })), tag: 'SYS-29' },
        { key: 'every', label: 'التكرار', render: (j) => every(j.every_minutes), tag: 'SYS-30' },
        { key: 'last', label: 'آخر تشغيل', render: (j) => timeCell(j.last_started_at), tag: 'SYS-31' },
        {
          key: 'status',
          label: 'الحالة',
          render: (j) => h('div.stack-sm', jobStatus(j), j.last_error ? h('span.pf-error-text', { dir: 'auto' }, j.last_error) : null),
          tag: 'SYS-32',
        },
        { key: 'runs', label: 'مرات التشغيل', align: 'end', render: (j) => num(j.runs || 0), tag: 'SYS-33' },
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
              { size: 'sm', icon: 'refresh', tag: 'SYS-34' },
            ),
            tag: 'SYS-35',
        },
      ],
      rows: d.jobs,
      rowTag: 'SYS-36',
      tag: 'SYS-37',
    }),
    titleTag: 'SYS-38',
    tag: 'SYS-39',
  });
}

// ───────── v12 media (MD-11، M12-36، P1): أدوات المستندات والصوت، الطابور، «شغّل الآن»، الاستكمال ─────────
const MEDIA_TOOL_NAMES = { imagemagick: 'ImageMagick (تحسين الصور)', tesseract: 'Tesseract (قراءة النص)', pdftotext: 'pdftotext (نص ملفات PDF)', pdftoppm: 'pdftoppm (صفحات PDF)', pdfinfo: 'pdfinfo (مقاس صفحات PDF)' };
const MEDIA_TOOL_WHY = { disabled: 'متوقفة (MEDIA_TOOLS)', missing: 'غير مثبتة', policy: 'مثبتة بلا سياسة الأمان المرفقة', no_ara: 'مثبتة بلا اللغة العربية', bin_missing: 'المسار المحدد غير موجود', bin_not_absolute: 'المسار المحدد ليس مسارًا كاملًا', no_version: 'لا تعمل', probe_failed: 'تعذر فحصها' };
const MEDIA_KIND = { stt: 'تحويل الصوت', clean: 'تحسين الصور', ocr: 'قراءة النص' };
// مراجعة 12.0: أسباب «آخر ما لم يُعالَج» بالعربية (الرمز التقني يبقى في التلميح)
const MEDIA_WHY = {
  no_paper: 'لا توجد ورقة في الصورة',
  not_paper: 'الصورة ليست ورقة',
  uncertain: 'حدود الورقة غير مؤكدة',
  partial: 'الورقة مقصوصة في الصورة',
  too_large: 'الصورة أكبر من المسموح',
  tool_error: 'لم تستطع الأداة فتح الملف',
  unknown_size: 'مقاس الصورة غير معروف',
  heic: 'صيغة HEIC',
  tool_missing: 'الأداة غير مثبتة على الخادم',
  needs_imagemagick: 'تحتاج ImageMagick على الخادم',
  low_memory: 'ذاكرة الخادم لم تكفِ',
  off: 'متوقف من الإعدادات',
  unsupported: 'نوع الملف غير مدعوم',
  no_text: 'لا يوجد نص مقروء',
  timeout: 'انتهت المهلة',
  crashed: 'توقف أثناء التشغيل',
  file_missing: 'الملف غير موجود',
  charity: 'طلب «خيري»',
  before_disclosure: 'وصل قبل إعلان الخصوصية',
  too_long: 'الرسالة أطول من المسموح',
  client_cap: 'بلغ حد الدقائق اليومي',
  budget: 'بلغ حد الإنفاق الشهري',
  auth: 'المفتاح مرفوض',
};

function mediaCard(reload) {
  const body = h('div.stack-md', h('p.pf-muted', 'جارٍ التحميل…'));
  const el = card({ title: 'المستندات والصوت', icon: 'fileText', subtitle: 'أدوات الخادم الاختيارية وطابور تحويل الصوت وتحسين الصور وقراءة النص.', body, titleTag: 'SYS-40', tag: 'SYS-41' });
  el.id = 'media-tools';
  async function draw(probe = false) {
    let st;
    try {
      st = await api.get('/admin/media/status', probe ? { probe: '1' } : null);
    } catch (err) {
      mount(body, alertBox(err.message || 'تعذر تحميل حالة المعالجة', 'danger', { tag: 'SYS-42' }));
      return;
    }
    const tools = st.tools || {};
    const toolRows = Object.keys(MEDIA_TOOL_NAMES).map((k) => {
      const t = tools[k] || {};
      return { k, name: MEDIA_TOOL_NAMES[k], ok: !!t.ok, state: t.ok ? (t.version || 'تعمل') : MEDIA_TOOL_WHY[t.reason] || 'غير مثبتة' };
    });
    const queue = (st.queue || []).filter((q) => q.state === 'queued' || q.state === 'running' || q.state === 'failed');
    const errs = st.last_errors || [];
    const mb = (n) => (Number.isFinite(Number(n)) ? `${Math.round(Number(n) / (1024 * 1024))} ميجابايت` : '');
    const backfill = (label, kinds, tag) =>
      h(
        'span',
        { tag },
        asyncButton(
          label,
          async () => {
            let n = 0;
            for (const kind of kinds) {
              const r = await api.post('/admin/media/backfill', { kind });
              n += Number(r.queued) || 0;
            }
            toast(n ? `أُضيف ${count(n, ['مستند واحد', 'مستندان', 'مستندات', 'مستندًا'])} إلى الطابور` : 'لا يوجد ما يُستكمل', 'success');
            draw();
          },
          { size: 'sm', variant: 'ghost', icon: 'refresh', tag: 'SYS-43' },
        ),
      );
    mount(
      body,
      h(
        'ul.pf-checks',
        { tag: 'SYS-01' },
        toolRows.map((r) => h('li.pf-check', { class: r.ok ? 'is-ok' : 'is-info' }, h('div.pf-check-body', h('div.pf-check-title', r.name), h('div.pf-check-detail', { dir: 'auto' }, r.state)))),
      ),
      h('p.pf-muted', { tag: 'SYS-08' }, `الذاكرة المتاحة الآن: ${mb(st.memory?.headroom_bytes)} من ${mb(st.memory?.limit_bytes)}. البحث في النص: ${st.fts ? 'FTS5' : 'بحث نصي بسيط'}.`),
      h(
        'div',
        { tag: 'SYS-03' },
        queue.length
          ? h('ul.list-plain', queue.map((q) => h('li', `${MEDIA_KIND[q.kind] || q.kind}: ${label('media_state', q.state)} ${num(q.n)}`)))
          : h('p.pf-muted', 'لا شيء في الطابور الآن.'),
      ),
      errs.length ? h('ul.list-plain.small', { tag: 'SYS-04' }, errs.slice(0, 5).map((e) => h('li', `${MEDIA_KIND[e.kind] || e.kind} · مستند ${e.document_id}: `, MEDIA_WHY[e.error] ? h('span', { title: e.error }, MEDIA_WHY[e.error]) : h('code', { dir: 'ltr' }, e.error)))) : null,
      h(
        'div.row.wrap',
        h(
          'span',
          { tag: 'SYS-02' },
          asyncButton('افحص الأدوات', () => draw(true), { size: 'sm', variant: 'ghost', icon: 'search', tag: 'SYS-44' }),
        ),
        h(
          'span',
          { tag: 'SYS-05' },
          asyncButton(
            'شغّل الآن',
            async () => {
              await api.post('/admin/system/jobs/media.process/run');
              toast('بدأت المعالجة', 'success');
              setTimeout(() => draw(), 1500);
            },
            { size: 'sm', icon: 'zap', tag: 'SYS-45' },
          ),
        ),
        backfill('حوّل الرسائل الصوتية المعلقة (آخر 30 يومًا)', ['stt'], 'SYS-06'),
        backfill('نظّف واقرأ المستندات القديمة', ['clean', 'ocr'], 'SYS-07'),
      ),
    );
  }
  draw();
  void reload;
  return el;
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
        button('فتح صندوق الصادر', { icon: 'arrowLeft', variant: 'secondary', size: 'sm', href: '#/automations?tab=outbox&status=failed', tag: 'SYS-46' }),
      ),
      titleTag: 'SYS-47',
      tag: 'SYS-48',
    }),
    card({
      title: 'التكاملات',
      icon: 'link',
      body: h(
        'div.stack',
        kv([
          ['واتساب', h('div.pf-badges', badge(i.whatsapp.label, i.whatsapp.live ? 'success' : 'muted'), testLine(i.whatsapp.last_test))],
          ['الذكاء الاصطناعي', h('div.pf-badges', badge(i.anthropic.label, i.anthropic.live ? 'success' : 'info'), testLine(i.anthropic.last_test))],
          [
            'مفتاح التشفير',
            h(
              'div.pf-badges',
              badge(label('key_source', i.key_source), i.key_source === 'env' ? 'success' : i.key_source === 'file' ? 'warning' : 'danger'),
              // المسار الفعلي كما يحسبه الخادم (DATA_DIR/.secret-key)، لا مسار ثابت قد لا يطابق مجلد البيانات
              i.key_source === 'file' && i.key_file ? codeTag(i.key_file) : null,
            ),
          ],
          ['رابط Webhook', h('code.pf-code', { dir: 'ltr' }, d.webhook_url)],
        ]),
        button('إدارة التكاملات', { icon: 'arrowLeft', variant: 'secondary', size: 'sm', href: '#/integrations', tag: 'SYS-49' }),
      ),
      titleTag: 'SYS-50',
      tag: 'SYS-51',
    }),
  );
}

async function editBackupSettings(b, reload) {
  const res = await formDialog({
    title: 'إعدادات النسخ الاحتياطي',
    intro: 'تُنشأ نسخة تلقائية مرة كل يوم في مجلد النسخ على الخادم، ويُحذف الأقدم تلقائيًا بعد بلوغ العدد المحدد (يشمل ذلك النسخ اليدوية).',
    fields: [
      { name: 'enabled', type: 'checkbox', label: 'النسخ الاحتياطي اليومي التلقائي', text: 'تفعيل النسخ الاحتياطي اليومي التلقائي', tag: 'SYS-52' },
      { name: 'retention', type: 'number', label: 'عدد النسخ المحتفظ بها', required: true, integer: true, min: 1, max: 365, suffix: 'نسخة', hint: 'من 1 إلى 365. الافتراضي 14 (أسبوعان).', tag: 'SYS-53' },
    ],
    values: { enabled: b.enabled, retention: b.retention },
    onSubmit: (vals) => api.put('/admin/system/backup-settings', vals),
    tag: 'SYS-54',
  });
  if (!res) return;
  toast('تم حفظ إعدادات النسخ الاحتياطي', 'success');
  reload();
}

function backupsCard(b, reload) {
  // رابط تنزيل لمرة واحدة بطلب POST (صالح دقيقة لهذه الجلسة)، ثم يحفظ المتصفح الملف مباشرة
  const download = (file) =>
    asyncButton(
      'تنزيل',
      async () => {
        await downloadFile(`/admin/system/backups/${encodeURIComponent(file)}/download`, {}, { mode: 'navigate', fallbackName: file });
        toast('بدأ التنزيل. احفظ الملف في مكان آمن ومشفر؛ فهو يحتوي على بيانات المستفيدين.', 'info', 5000);
      },
      { size: 'sm', variant: 'ghost', icon: 'download', ariaLabel: `تنزيل ${file}`, tag: 'SYS-55' },
    );
  const del = (file) =>
    button('', {
      size: 'sm',
      variant: 'ghost',
      icon: 'trash',
      title: `حذف ${file}`,
      onClick: async () => {
        const ok = await confirmDanger({ title: 'حذف نسخة احتياطية', message: `سيُحذف الملف ${file} نهائيًا من الخادم. هل تريد المتابعة؟`, confirmLabel: 'حذف النسخة', tag: 'SYS-56' });
        if (!ok) return;
        try {
          await api.del(`/admin/system/backups/${encodeURIComponent(file)}`);
          toast('تم حذف النسخة', 'success');
          reload();
        } catch (err) {
          toast(err.message, 'danger');
        }
      },
      tag: 'SYS-57',
    });
  const lastNote = b.last
    ? b.stale
      ? alertBox(`آخر نسخة احتياطية أُنشئت ${relative(b.last.created_at)} (أكثر من ${count(b.stale_after_hours, 'hour')}). تأكد من عمل المجدول أو أنشئ نسخة الآن.`, 'warning', { title: 'النسخ الاحتياطي متأخر', tag: 'SYS-58' })
      : null
    : alertBox('لا توجد أي نسخة احتياطية بعد. أنشئ نسخة الآن ثم نزّلها واحفظها خارج الخادم.', 'warning', { title: 'لا توجد نسخ احتياطية', tag: 'SYS-59' });
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
      button('الإعدادات', { size: 'sm', variant: 'ghost', icon: 'settings', onClick: () => editBackupSettings(b, reload), tag: 'SYS-60' }),
      b.available
        ? asyncButton(
            'نسخ احتياطي الآن',
            async () => {
              const r = await api.post('/admin/system/backups');
              toast(`تم إنشاء النسخة ${r.file} (${bytes(r.size_bytes)})`, 'success');
              reload();
            },
            { size: 'sm', variant: 'primary', icon: 'download', tag: 'SYS-61' },
          )
        : null,
    ),
    body: h(
      'div.stack',
      { id: 'backups' },
      !b.available ? alertBox('قاعدة البيانات تعمل في الذاكرة؛ النسخ الاحتياطي غير متاح.', 'info', { tag: 'SYS-62' }) : null,
      !b.enabled ? alertBox('النسخ الاحتياطي اليومي التلقائي متوقف. فعّله من «الإعدادات».', 'warning', { tag: 'SYS-63' }) : null,
      lastNote,
      b.items.length
        ? table({
            caption: 'النسخ الاحتياطية المتاحة على الخادم',
            className: 'pf-stack-table',
            columns: [
              { key: 'file', label: 'الملف', render: (r) => codeTag(r.file), tag: 'SYS-64' },
              { key: 'created_at', label: 'التاريخ', render: (r) => h('div', h('div.nowrap', dateTime(r.created_at)), h('span.pf-muted', relative(r.created_at))), tag: 'SYS-65' },
              { key: 'kind', label: 'النوع', render: (r) => (r.kind ? badge(label('backup_kind', r.kind), r.kind === 'manual' ? 'info' : r.kind === 'auto' ? 'neutral' : 'warning') : badge('غير مسجلة', 'muted')), tag: 'SYS-66' },
              { key: 'size_bytes', label: 'الحجم', align: 'end', render: (r) => h('span.nowrap', bytes(r.size_bytes)), tag: 'SYS-67' },
              { key: 'integrity', label: 'فحص السلامة', render: (r) => (r.integrity === 'ok' ? badge('سليمة', 'success', { icon: 'check' }) : r.integrity ? badge('بها خلل', 'danger', { title: r.integrity }) : badge('—', 'muted')), tag: 'SYS-68' },
              { key: 'actions', label: 'إجراءات', render: (r) => h('div.pf-row-actions', download(r.file), del(r.file)), tag: 'SYS-69' },
            ],
            rows: b.items,
            rowTag: 'SYS-70',
            tag: 'SYS-71',
          })
        : emptyState('لا توجد نسخ احتياطية محفوظة على الخادم بعد.', null, { compact: true, icon: 'refresh', tag: 'SYS-72' }),
      b.items.length ? h('p.pf-muted', `الإجمالي: ${count(b.items.length, ['نسخة واحدة', 'نسختين', 'نسخ', 'نسخة'])} بحجم ${bytes(b.total_bytes)}.`) : null,
    ),
    titleTag: 'SYS-73',
    tag: 'SYS-74',
  });
}

function exportCard(keySource, keyFile) {
  let includeKey = false;
  const keyToggle =
    keySource === 'file'
      ? h(
          'label.check.check-single',
          h('input', { type: 'checkbox', onChange: (e) => (includeKey = e.target.checked), tag: 'SYS-75' }),
          h(
            'span',
            'تضمين مفتاح التشفير ',
            keyFile ? codeTag(keyFile) : '(الملف .secret-key في مجلد البيانات)',
            ' — لازم لنقل أسرار التكاملات المحفوظة إلى الخادم الجديد',
          ),
        )
      : null;
  const start = async () => {
    const ok = await confirmDialog({
      title: 'تصدير كامل للمنصة',
      message: `سيُنزَّل أرشيف يضم قاعدة البيانات كاملة وكل المستندات المرفوعة${includeKey ? ' ومفتاح التشفير' : ''}، أي كل بيانات المستفيدين. احفظه في مكان مشفر واحذفه بعد إتمام النقل. يُسجَّل التصدير في سجل الأمان.`,
      confirmLabel: 'بدء التنزيل',
      tag: 'SYS-76',
    });
    if (!ok) return;
    try {
      await downloadFile('/admin/system/export', { include_key: includeKey }, { mode: 'navigate', fallbackName: 'beyoot-legal-export.tar.gz' });
      toast('بدأ تجهيز الأرشيف وتنزيله؛ قد يستغرق ذلك دقيقة مع كثرة المرفقات.', 'info', 6000);
    } catch (err) {
      toast(err.message, 'danger', 6000);
    }
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
        ? alertBox('مفتاح التشفير مضبوط من APP_SECRET: اضبط نفس القيمة على الخادم الجديد حتى تبقى أسرار التكاملات صالحة.', 'info', { tag: 'SYS-77' })
        : null,
      keyToggle,
      h('div', button('تنزيل التصدير الكامل', { variant: 'primary', icon: 'download', onClick: start, tag: 'SYS-78' })),
    ),
    titleTag: 'SYS-79',
    tag: 'SYS-80',
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
      mount(host, pageHeader({ title: 'صحة النظام والنسخ الاحتياطي', titleTag: 'SYS-81', tag: 'SYS-82' }), errorState(err, load));
      return;
    }
    mount(
      host,
      pageHeader({
        title: 'صحة النظام والنسخ الاحتياطي',
        subtitle: 'حالة الخادم وقاعدة البيانات والمهام الدورية والتكاملات، والنسخ الاحتياطي والتصدير الكامل.',
        meta: h('div.pf-badges', badge(`الإصدار ${d.version}`, 'primary'), badge(`بيئة ${ENV_LABEL[d.environment] || d.environment}`, ENV_TONE[d.environment] || 'neutral'), h('span.pf-muted', `حُدّثت ${dateTime(new Date().toISOString())}`)),
        actions: button('تحديث', { icon: 'refresh', variant: 'ghost', onClick: load, tag: 'SYS-83' }),
        titleTag: 'SYS-84',
        tag: 'SYS-85',
      }),
      h(
        'div.stack-lg',
        readiness(d.checks),
        stats(d),
        backupsCard(b, load),
        h('div.grid-2.pf-grid', serverCard(d), dbCard(d)),
        jobsCard(d, load),
        mediaCard(load), // v12 media (MD-11، P1)
        outboxAndIntegrations(d),
        exportCard(d.integrations.key_source, d.integrations.key_file),
      ),
    );
    if (ctx && ctx.query && ctx.query.focus === 'backups') {
      requestAnimationFrame(() => document.getElementById('backups')?.scrollIntoView({ block: 'start' }));
    }
  }
  await load();
  return frag(host);
}
