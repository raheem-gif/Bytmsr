// خدمات البنية المشتركة في الإصدار 9: سجل الأمان، المهام الدورية، وامتدادات /api/meta والصفحات العامة.
import { nowIso, parseJson } from '../util.js';

/** سجل الأمان والتدقيق: من فعل ماذا ومتى ومن أين (لا يُعدَّل ولا يُحذف من الواجهة) */
export function createAudit(app) {
  const { db } = app;
  return {
    /**
     * @param {{actor?:object, type:string, summary:string, severity?:'info'|'warning'|'critical', ip?:string, user_agent?:string, data?:object, ctx?:object}} e
     * ctx: سياق الطلب (يُستخرج منه عنوان IP والمتصفح تلقائيًا)
     */
    log({ actor = null, type, summary, severity = 'info', ip = null, user_agent = null, data = null, ctx = null }) {
      try {
        db.insert('security_events', {
          type,
          severity,
          user_id: actor?.id ?? null,
          actor_name: actor?.name ?? (actor?.kind ? actor.kind : null),
          ip: ip ?? ctx?.ip ?? null,
          user_agent: (user_agent ?? (ctx?.req?.headers?.['user-agent'] || null))?.slice(0, 300) ?? null,
          summary: String(summary).slice(0, 500),
          data: data ? JSON.stringify(data) : null,
          created_at: nowIso(),
        });
      } catch (e) {
        app.log('audit log failed', e);
      }
    },
    list({ type, user_id, severity, q, limit = 100, offset = 0 } = {}) {
      const where = ['1=1'];
      const params = [];
      if (type) {
        where.push('(e.type = ? OR e.type LIKE ?)');
        params.push(type, `${type}.%`);
      }
      if (user_id) {
        where.push('e.user_id = ?');
        params.push(Number(user_id));
      }
      if (severity) {
        where.push('e.severity = ?');
        params.push(severity);
      }
      if (q) {
        where.push('(e.summary LIKE ? OR e.actor_name LIKE ? OR e.ip LIKE ?)');
        const like = `%${String(q).trim()}%`;
        params.push(like, like, like);
      }
      const sql = `FROM security_events e LEFT JOIN users u ON u.id = e.user_id WHERE ${where.join(' AND ')}`;
      return {
        items: db
          .all(`SELECT e.*, u.name AS user_name, u.role AS user_role ${sql} ORDER BY e.id DESC LIMIT ? OFFSET ?`, ...params, Math.min(Number(limit) || 100, 500), Number(offset) || 0)
          .map((r) => ({ ...r, data: parseJson(r.data, null) })),
        total: Number(db.value(`SELECT COUNT(*) ${sql}`, ...params)),
      };
    },
  };
}

/**
 * سجل المهام الدورية: تسجّل كل وحدة مهامها هنا ويشغلها المجدول الرئيسي.
 * register(name, { everyMinutes, run: async () => result, label })
 */
export function createJobs(app) {
  const { db } = app;
  const jobs = new Map();
  let running = false;
  return {
    register(name, { everyMinutes, run, label }) {
      jobs.set(name, { name, everyMinutes: Math.max(1, Number(everyMinutes) || 60), run, label: label || name });
    },
    list() {
      const state = Object.fromEntries(db.all('SELECT * FROM job_runs').map((r) => [r.name, r]));
      return [...jobs.values()].map((j) => ({ name: j.name, label: j.label, every_minutes: j.everyMinutes, ...(state[j.name] || {}) }));
    },
    /** تشغيل المهام المستحقة (أو كلها عند force) */
    async runDue({ force = false, only = null } = {}) {
      if (running) return [];
      running = true;
      const out = [];
      try {
        for (const j of jobs.values()) {
          if (only && j.name !== only) continue;
          const st = db.get('SELECT * FROM job_runs WHERE name = ?', j.name);
          const due = force || !st?.last_started_at || Date.parse(st.last_started_at) + j.everyMinutes * 60000 <= Date.now();
          if (!due) continue;
          const started = nowIso();
          db.run(
            `INSERT INTO job_runs (name, last_started_at, runs) VALUES (?, ?, 1)
             ON CONFLICT(name) DO UPDATE SET last_started_at = excluded.last_started_at, runs = runs + 1`,
            j.name,
            started,
          );
          try {
            const result = await j.run();
            db.run('UPDATE job_runs SET last_finished_at = ?, last_ok_at = ?, last_error = NULL, last_result = ? WHERE name = ?', nowIso(), nowIso(), result === undefined ? null : JSON.stringify(result).slice(0, 2000), j.name);
            out.push({ name: j.name, ok: true, result });
          } catch (e) {
            app.log(`job ${j.name} failed`, e);
            db.run('UPDATE job_runs SET last_finished_at = ?, last_error = ? WHERE name = ?', nowIso(), String(e?.message || e).slice(0, 1000), j.name);
            out.push({ name: j.name, ok: false, error: String(e?.message || e) });
          }
        }
      } finally {
        running = false;
      }
      return out;
    },
  };
}
