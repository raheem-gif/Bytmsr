// طبقة قاعدة البيانات: SQLite المدمج في Node (node:sqlite) بدون أي اعتماديات خارجية.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = [
  ['portal_tokens', 'intake_id', 'INTEGER REFERENCES intakes(id)'],
  ['assignments', 'last_viewed_at', 'TEXT'],
  ['users', 'deactivated_at', 'TEXT'],
  ['matter_events', 'client_text_approved', 'INTEGER NOT NULL DEFAULT 1'],
];

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = fs.readFileSync(path.join(SRC_DIR, 'schema.sql'), 'utf8');

/**
 * امتدادات المخطط: كل وحدة تضيف جداولها في src/schema.d/<name>.sql (تُنفذ بترتيب الاسم بعد المخطط الأساسي)،
 * وأعمدتها الجديدة على جداول قائمة في src/schema.d/<name>.columns.json بصيغة [["table","column","DDL"], ...].
 */
function schemaExtensions() {
  const dir = path.join(SRC_DIR, 'schema.d');
  if (!fs.existsSync(dir)) return { sql: [], columns: [] };
  const files = fs.readdirSync(dir).sort();
  return {
    sql: files.filter((f) => f.endsWith('.sql')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')),
    columns: files.filter((f) => f.endsWith('.columns.json')).flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))),
  };
}
const EXT = schemaExtensions();

function clean(params) {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p !== null && typeof p === 'object' && !(p instanceof Uint8Array)) return JSON.stringify(p);
    return p;
  });
}

export class Db {
  constructor(file) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA foreign_keys = ON;');
    this.raw.exec('PRAGMA busy_timeout = 5000;');
    if (file !== ':memory:') this.raw.exec('PRAGMA journal_mode = WAL;');
    this.raw.exec(SCHEMA);
    // ترحيلات بسيطة لقواعد بيانات أُنشئت بإصدار سابق من المخطط (الأعمدة أولًا ثم جداول الامتدادات وفهارسها)
    for (const [table, column, ddl] of [...MIGRATIONS, ...EXT.columns]) {
      const cols = this.raw.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);
      if (!cols.includes(column)) this.raw.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
    for (const sql of EXT.sql) this.raw.exec(sql);
    this.cache = new Map();
    this.depth = 0;
  }

  stmt(sql) {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.raw.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }
  get(sql, ...params) {
    return this.stmt(sql).get(...clean(params));
  }
  all(sql, ...params) {
    return this.stmt(sql).all(...clean(params));
  }
  run(sql, ...params) {
    const r = this.stmt(sql).run(...clean(params));
    return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
  }
  value(sql, ...params) {
    const row = this.get(sql, ...params);
    if (!row) return undefined;
    return Object.values(row)[0];
  }

  /** إدراج صف وإرجاع المعرف */
  insert(table, obj) {
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
    return this.run(sql, ...keys.map((k) => obj[k])).id;
  }
  /** تحديث صف بالمعرف (الحقول غير المعرفة تُتجاهل) */
  update(table, id, obj, idCol = 'id') {
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
    if (!keys.length) return 0;
    const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${idCol} = ?`;
    return this.run(sql, ...keys.map((k) => obj[k]), id).changes;
  }

  /** معاملة (Transaction) قابلة للتداخل عبر SAVEPOINT */
  tx(fn) {
    const sp = `sp_${this.depth}`;
    if (this.depth === 0) this.raw.exec('BEGIN IMMEDIATE');
    else this.raw.exec(`SAVEPOINT ${sp}`);
    this.depth++;
    try {
      const result = fn();
      if (result && typeof result.then === 'function') {
        throw new Error('db.tx لا يقبل دوال غير متزامنة');
      }
      this.depth--;
      if (this.depth === 0) this.raw.exec('COMMIT');
      else this.raw.exec(`RELEASE ${sp}`);
      return result;
    } catch (err) {
      this.depth--;
      if (this.depth === 0) this.raw.exec('ROLLBACK');
      else {
        this.raw.exec(`ROLLBACK TO ${sp}`);
        this.raw.exec(`RELEASE ${sp}`);
      }
      throw err;
    }
  }

  /** عداد تسلسلي ذري (لأكواد الملفات والعملاء) */
  nextCounter(key, startAt = 1) {
    return this.tx(() => {
      const row = this.get('SELECT value FROM counters WHERE key = ?', key);
      const next = row ? Number(row.value) + 1 : startAt;
      this.run('INSERT INTO counters (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, next);
      return next;
    });
  }
  setCounter(key, value) {
    this.run('INSERT INTO counters (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
  }

  close() {
    this.raw.close();
  }
}
