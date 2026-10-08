// العملاء: هوية موحدة عبر القنوات (رقم الهاتف/البريد)، الدمج، وروابط البوابة الآمنة.
import {
  nowIso, addDays, normalizePhone, latinDigits, randomToken, sha256, parseJson, badRequest, notFound, conflict, v, normalizeArabic,
} from '../util.js';
import { CODE_PREFIX } from '../constants.js';

export function createClients(app) {
  const { db, config } = app;

  function nextCode() {
    const n = db.nextCounter('client', 1);
    return `${CODE_PREFIX.client}-${String(n).padStart(5, '0')}`;
  }

  const svc = {
    get(id) {
      // إذا دُمج العميل في آخر نتبع الدمج حتى العميل الباقي (مع حماية من أي حلقة)
      const seen = new Set();
      let c = db.get('SELECT * FROM clients WHERE id = ?', id);
      while (c && c.merged_into && !seen.has(c.id) && seen.size < 50) {
        seen.add(c.id);
        c = db.get('SELECT * FROM clients WHERE id = ?', c.merged_into);
      }
      if (!c || (c.merged_into && seen.has(c.id))) return null;
      return c;
    },
    require(id) {
      const c = svc.get(id);
      if (!c) throw notFound('العميل غير موجود');
      return c;
    },

    findByPhone(phone) {
      const p = normalizePhone(phone);
      if (!p) return null;
      const row = db.get("SELECT client_id FROM client_identities WHERE kind = 'phone' AND value = ?", p);
      return row ? svc.get(row.client_id) : null;
    },
    findByEmail(email) {
      if (!email) return null;
      const row = db.get("SELECT client_id FROM client_identities WHERE kind = 'email' AND value = ?", String(email).toLowerCase());
      return row ? svc.get(row.client_id) : null;
    },

    create({ name = null, governorate = null, email = null, national_id = null, notes = null } = {}) {
      const t = nowIso();
      const id = db.insert('clients', {
        code: nextCode(),
        name: name || null,
        governorate,
        email: email || null,
        national_id,
        notes,
        created_at: t,
        updated_at: t,
      });
      return svc.get(id);
    },

    /** ربط هوية (هاتف/بريد) بالعميل؛ يرفض إن كانت مرتبطة بعميل آخر */
    addIdentity(clientId, kind, value, channel = null) {
      const val = kind === 'phone' ? normalizePhone(value) : String(value || '').trim().toLowerCase();
      if (!val) throw badRequest(kind === 'phone' ? 'رقم الهاتف غير صالح' : 'القيمة غير صالحة');
      const existing = db.get('SELECT * FROM client_identities WHERE kind = ? AND value = ?', kind, val);
      if (existing) {
        const owner = svc.get(existing.client_id);
        if (owner && owner.id !== clientId) {
          throw conflict(`هذا ${kind === 'phone' ? 'الرقم' : 'البريد'} مرتبط بالفعل بالعميل ${owner.code}. يمكن دمج العميلين بدلًا من ذلك.`, {
            client_id: owner.id,
            client_code: owner.code,
          });
        }
        if (channel) {
          const chans = parseJson(existing.channels, []);
          if (!chans.includes(channel)) {
            chans.push(channel);
            db.run('UPDATE client_identities SET channels = ? WHERE id = ?', JSON.stringify(chans), existing.id);
          }
        }
        return existing.id;
      }
      return db.insert('client_identities', {
        client_id: clientId,
        kind,
        value: val,
        channels: JSON.stringify(channel ? [channel] : []),
        created_at: nowIso(),
      });
    },

    identities(clientId) {
      return db
        .all('SELECT id, kind, value, channels, created_at FROM client_identities WHERE client_id = ? ORDER BY id', clientId)
        .map((r) => ({ ...r, channels: parseJson(r.channels, []) }));
    },

    /**
     * إيجاد العميل بالهاتف أو البريد أو إنشاؤه — قلب توحيد القنوات:
     * نفس الرقم من الموقع أو واتساب = نفس العميل.
     */
    resolveOrCreate({ phone, email, name, governorate, channel, verified = true }) {
      return db.tx(() => {
        const p = phone ? normalizePhone(phone) : null;
        // من الموقع لا نتحقق من ملكية الهاتف أو البريد: نطابق بالهاتف فقط ولا نطابق بالبريد أبدًا
        let client = (p && svc.findByPhone(p)) || (verified && email && svc.findByEmail(email)) || null;
        let created = false;
        if (!client) {
          client = svc.create({ name, governorate, email });
          created = true;
        } else if (verified) {
          // نكمل البيانات الناقصة فقط ولا نستبدل ما سجلته الإدارة
          const patch = {};
          if (!client.name && name) patch.name = name;
          if (!client.governorate && governorate) patch.governorate = governorate;
          if (!client.email && email) patch.email = email;
          if (Object.keys(patch).length) {
            db.update('clients', client.id, { ...patch, updated_at: nowIso() });
            client = svc.get(client.id);
          }
        }
        if (p) svc.addIdentity(client.id, 'phone', p, channel);
        // بريد غير موثّق لا يُضاف لعميل موجود (قد يكون المرسل شخصًا آخر استخدم رقمه)
        if (email && (verified || created)) {
          try {
            svc.addIdentity(client.id, 'email', email, channel);
          } catch {
            // البريد مرتبط بعميل آخر: لا نوقف استقبال الطلب، والإدارة يمكنها الدمج لاحقًا
          }
        }
        return { client, created };
      });
    },

    primaryPhone(clientId) {
      const r = db.get("SELECT value FROM client_identities WHERE client_id = ? AND kind = 'phone' ORDER BY id LIMIT 1", clientId);
      return r ? r.value : null;
    },

    update(clientId, body, actor) {
      const c = svc.require(clientId);
      const patch = {
        name: body.name !== undefined ? v.str(body.name, 'الاسم', { max: 150 }) : undefined,
        national_id: body.national_id !== undefined ? validateNationalId(body.national_id) : undefined,
        governorate: body.governorate !== undefined ? v.str(body.governorate, 'المحافظة', { max: 50 }) : undefined,
        email: body.email !== undefined ? v.email(body.email, 'البريد الإلكتروني') : undefined,
        notes: body.notes !== undefined ? v.str(body.notes, 'الملاحظات', { max: 5000 }) : undefined,
        // v9.1 b-portal (B91-02): طريقة المخاطبة في صفحة المتابعة ورسائلها — 'f' مؤنث، 'm' مذكر، فارغ = تلقائي من الاسم
        address_form: body.address_form !== undefined ? (body.address_form === 'm' || body.address_form === 'f' ? body.address_form : body.address_form === '' || body.address_form === null ? null : v.oneOf(body.address_form, ['f', 'm'], 'طريقة المخاطبة')) : undefined,
        updated_at: nowIso(),
      };
      // v9.2 [R2-B21]: اسم غيّرته الإدارة صالح للرسائل الآلية («أهلًا يا …»)، بخلاف اسم ملف واتساب
      if (patch.name !== undefined && patch.name !== c.name) patch.name_source = 'staff';
      db.update('clients', c.id, patch);
      app.activity.log({ client_id: c.id, actor, type: 'client.updated', summary: 'تم تحديث بيانات العميل' });
      return svc.get(c.id);
    },

    /** دمج عميل مكرر في عميل أساسي: نقل الهويات والطلبات والملفات والرسائل */
    merge(targetId, otherId, actor) {
      if (targetId === otherId) throw badRequest('لا يمكن دمج العميل مع نفسه');
      const target = svc.require(targetId);
      // نحل الطرفين إلى العميل الباقي فعليًا قبل أي كتابة (قد يكون أحدهما مدموجًا من قبل)
      const other = svc.get(otherId);
      if (!other) throw notFound('العميل المراد دمجه غير موجود');
      if (other.id === target.id) throw conflict('العميلان مدموجان بالفعل في ملف واحد');
      db.tx(() => {
        db.run('UPDATE client_identities SET client_id = ? WHERE client_id = ?', target.id, other.id);
        for (const t of ['intakes', 'cases', 'messages', 'documents', 'matters', 'invoices', 'portal_tokens']) {
          db.run(`UPDATE ${t} SET client_id = ? WHERE client_id = ?`, target.id, other.id);
        }
        const patch = {};
        for (const k of ['name', 'national_id', 'governorate', 'email']) if (!target[k] && other[k]) patch[k] = other[k];
        db.update('clients', target.id, { ...patch, updated_at: nowIso() });
        db.update('clients', other.id, { merged_into: target.id, updated_at: nowIso() });
        app.practice?.onClientsMerged(target.id, other.id); // v9 practice: نقل بطاقة المستفيد وبيانات الأسرة المقترحة
        app.activity.log({
          client_id: target.id,
          actor,
          type: 'client.merged',
          summary: `تم دمج العميل ${other.code} في ${target.code}`,
          data: { merged_code: other.code },
        });
      });
      return svc.get(target.id);
    },

    list({ q, limit = 100, offset = 0 } = {}) {
      const params = [];
      let where = 'c.merged_into IS NULL';
      if (q) {
        const query = String(q).trim();
        const like = `%${query}%`;
        const digits = latinDigits(query).replace(/\D/g, '');
        const fullPhone = digits.length >= 10 ? normalizePhone(query) : null;
        if (fullPhone) {
          // رقم كامل: مطابقة تامة فقط حتى لا يظهر أشخاص آخرون تتشابه أرقامهم جزئيًا
          where += ` AND EXISTS (SELECT 1 FROM client_identities i WHERE i.client_id = c.id AND i.kind = 'phone' AND i.value = ?)`;
          params.push(fullPhone);
        } else {
          where += ` AND (c.name LIKE ? OR c.code LIKE ? OR EXISTS (SELECT 1 FROM client_identities i WHERE i.client_id = c.id AND i.value LIKE ?))`;
          params.push(like, like, digits.length >= 4 ? `%${digits}%` : like);
        }
      }
      const rows = db.all(
        `SELECT c.*,
           (SELECT COUNT(*) FROM intakes WHERE client_id = c.id) AS intakes_count,
           (SELECT COUNT(*) FROM cases WHERE client_id = c.id) AS cases_count,
           (SELECT COUNT(*) FROM cases WHERE client_id = c.id AND status != 'closed') AS open_cases_count,
           (SELECT COUNT(*) FROM matters WHERE client_id = c.id) AS matters_count,
           (SELECT value FROM client_identities WHERE client_id = c.id AND kind = 'phone' ORDER BY id LIMIT 1) AS phone,
           (SELECT MAX(created_at) FROM messages WHERE client_id = c.id) AS last_contact_at
         FROM clients c WHERE ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?`,
        ...params,
        Math.min(Number(limit) || 100, 500),
        Number(offset) || 0,
      );
      const total = db.value(`SELECT COUNT(*) FROM clients c WHERE ${where}`, ...params);
      return { items: rows, total: Number(total) };
    },

    /** ملف العميل الكامل للإدارة: كل الطلبات والملفات عبر الزمن */
    detail(clientId) {
      const c = svc.require(clientId);
      return {
        client: c,
        identities: svc.identities(c.id),
        active_portal_links: svc.activePortalLinks(c.id),
        intakes: db.all(
          'SELECT id, code, status, first_channel, source, title, legal_area, case_id, created_at FROM intakes WHERE client_id = ? ORDER BY id DESC',
          c.id,
        ),
        cases: db.all(
          'SELECT id, code, title, legal_area, status, outcome, matter_id, created_at, closed_at FROM cases WHERE client_id = ? ORDER BY id DESC',
          c.id,
        ),
        matters: db.all('SELECT id, code, title, kind, status, opened_at, closed_at FROM matters WHERE client_id = ? ORDER BY id DESC', c.id),
        invoices: db.all(
          `SELECT i.id, i.number, i.description, i.amount_minor, i.due_at, i.status, i.matter_id,
             (SELECT COALESCE(SUM(p.amount_minor), 0) FROM payments p WHERE p.invoice_id = i.id) AS paid_minor
           FROM invoices i WHERE i.client_id = ? ORDER BY i.id DESC`,
          c.id,
        ).map((i) => ({ ...i, amount: i.amount_minor / 100, paid_amount: Number(i.paid_minor) / 100, balance: (i.amount_minor - Number(i.paid_minor)) / 100 })),
        activity: db
          .all(
            `SELECT a.id, a.type, a.summary, a.actor_kind, a.created_at, u.name AS actor_name FROM activity a
             LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.client_id = ? ORDER BY a.id DESC LIMIT 50`,
            c.id,
          ),
      };
    },

    // ===== رابط البوابة الآمن للعميل =====
    /**
     * رابط بوابة آمن. intakeId يقصر الرابط على طلب واحد وما تفرع عنه (رابط الموقع)،
     * وبدونه يشمل كل ملفات العميل (رابط ترسله الإدارة لرقم موثّق).
     */
    issuePortalToken(clientId, { intakeId = null, days = null, phone = null } = {}) {
      const token = randomToken(24);
      const t = nowIso();
      const ttl = Number(days) > 0 ? Number(days) : config.portalTokenDays;
      db.insert('portal_tokens', {
        token_hash: sha256(token),
        client_id: clientId,
        intake_id: intakeId,
        // رابط صدر بعد الدخول برمز واتساب على رقم بعينه: نطاقه ما أتى من هذا الرقم فقط (انظر portal.scopeOf)
        phone: phone || null,
        created_at: t,
        expires_at: addDays(t, ttl),
      });
      return token;
    },
    portalUrl(token) {
      return `${config.publicBaseUrl || ''}/p/${token}`;
    },
    /**
     * v9.1 b-site (B91-01): رابط صفحة المتابعة داخل رسالة واتساب. نطاقه نطاق الدخول برمز واتساب على هذا الرقم
     * (لا تظهر فيه قصص غير مؤكدة) وعمره portalOtpTokenDays.
     */
    messageLink(clientId, phone) {
      const token = svc.issuePortalToken(clientId, { phone: phone || svc.primaryPhone(clientId), days: config.portalOtpTokenDays || 30 });
      return svc.portalUrl(token);
    },
    /** @returns {{ client, intakeId: number|null, phone: string|null } | null} */
    portalAccess(token) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
      const row = db.get('SELECT * FROM portal_tokens WHERE token_hash = ?', sha256(token));
      if (!row || row.revoked || row.expires_at <= nowIso()) return null;
      const client = svc.get(row.client_id);
      if (!client) return null;
      db.run('UPDATE portal_tokens SET last_used_at = ? WHERE token_hash = ?', nowIso(), row.token_hash);
      return { client, intakeId: row.intake_id ?? null, phone: row.phone || null };
    },
    /** إلغاء روابط البوابة: كل روابط العميل، أو روابط طلب واحد فقط. يعيد عدد الروابط الملغاة */
    revokePortalTokens(clientId, { intakeId = null } = {}) {
      const r = intakeId
        ? db.run('UPDATE portal_tokens SET revoked = 1 WHERE intake_id = ? AND revoked = 0', intakeId)
        : db.run('UPDATE portal_tokens SET revoked = 1 WHERE client_id = ? AND revoked = 0', clientId);
      return Number(r.changes || 0);
    },
    /** عدد روابط البوابة السارية (غير الملغاة وغير المنتهية) */
    activePortalLinks(clientId, { intakeId = null } = {}) {
      return Number(
        intakeId
          ? db.value('SELECT COUNT(*) FROM portal_tokens WHERE intake_id = ? AND revoked = 0 AND expires_at > ?', intakeId, nowIso())
          : db.value('SELECT COUNT(*) FROM portal_tokens WHERE client_id = ? AND revoked = 0 AND expires_at > ?', clientId, nowIso()),
      );
    },

    searchNormalized(q) {
      return normalizeArabic(q);
    },
  };
  return svc;
}

/** الرقم القومي المصري: 14 رقمًا يبدأ بـ 2 أو 3 */
export function validateNationalId(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const s = String(value).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/\s/g, '');
  if (!/^[23]\d{13}$/.test(s)) throw badRequest('الرقم القومي يجب أن يتكون من 14 رقمًا ويبدأ بـ 2 أو 3');
  return s;
}
