// Lane B shared fixtures. This module intentionally contains no test() calls; it is named
// lane-b-*.test.js only to respect the lane file-naming rule. Other lane-b files import it.
import assert from 'node:assert/strict';
import { samplePdf, waPayload } from './helpers.js';

export const LAWYER_PASSWORD = 'Lawyer@2026';

/** Assert an HTTP status and return the body (with a helpful diagnostic on failure). */
export function ok(r, status = 200, label = '') {
  assert.equal(
    r.status,
    status,
    `${label ? label + ': ' : ''}expected HTTP ${status}, got ${r.status} ${typeof r.body === 'object' && !Buffer.isBuffer(r.body) ? JSON.stringify(r.body).slice(0, 500) : ''}`,
  );
  return r.body;
}

let phoneSeq = 0;
/** A unique Egyptian mobile number (local format) with a distinctive digit pattern. */
export function uniquePhone() {
  phoneSeq += 1;
  const prefixes = ['0', '1', '2', '5'];
  const p = prefixes[phoneSeq % 4];
  return `01${p}${String(73100000 + phoneSeq * 7919).slice(-8)}`;
}
/** The 10 significant digits (without 0 / +20) — present in every rendering of the phone number. */
export function phoneCore(localPhone) {
  return String(localPhone).replace(/\D/g, '').replace(/^(?:20|0)/, '');
}

let userSeq = 0;
export async function createLawyer(admin, {
  username,
  name,
  specialties = ['GEN'],
  agreement = { type: 'per_case', rate: 500 },
  capacity,
  title,
} = {}) {
  userSeq += 1;
  const u = username || `lawyer${userSeq}${Math.random().toString(36).slice(2, 6)}`;
  const r = await admin.post('/api/admin/lawyers', {
    username: u,
    password: LAWYER_PASSWORD,
    name: name || `محامي اختبار ${userSeq}`,
    specialties,
    agreement,
    capacity,
    title,
  });
  const body = ok(r, 201, `create lawyer ${u}`);
  return { ...body, username: u };
}

/**
 * Build a consultation case end-to-end through the API (phone intake → convert → documents).
 * Returns ids, the case code, issue rows (ordered by number) and document rows (in the given order).
 */
export async function newCase(admin, {
  phone = uniquePhone(),
  clientName = 'عميل الاختبار',
  text = 'عندي مشكلة قانونية وأريد استشارة من فضلكم بخصوص الموضوع الخاص بي',
  legal_area = 'CIV',
  title = 'ملف اختبار',
  facts_shared = 'ملخص الوقائع المتاح للمحامي في هذا الملف.',
  facts_internal = null,
  issues = ['المسألة الأولى'],
  docs = [],
  national_id = null,
  email = null,
  source,
  campaign,
  internal_notes = null,
  case_manager_id,
} = {}) {
  const intake = ok(
    await admin.post('/api/admin/intakes', { channel: 'phone', phone, name: clientName, text, source, campaign }),
    201,
    'manual intake',
  );
  if (internal_notes) ok(await admin.patch(`/api/admin/intakes/${intake.id}`, { internal_notes }), 200, 'intake notes');
  const client = { name: clientName };
  if (national_id) client.national_id = national_id;
  if (email) client.email = email;
  const conv = ok(
    await admin.post(`/api/admin/intakes/${intake.id}/convert`, {
      legal_area,
      title,
      facts_shared,
      facts_internal,
      issues: issues.map((t) => ({ title: t })),
      client,
      case_manager_id,
    }),
    201,
    'convert intake',
  ).case;
  let documents = [];
  if (docs.length) {
    documents = ok(await admin.post(`/api/admin/cases/${conv.id}/documents`, { files: docs.map((n) => samplePdf(n)) }), 200, 'upload docs');
  }
  const detail = ok(await admin.get(`/api/admin/cases/${conv.id}`), 200, 'case detail');
  return {
    id: conv.id,
    code: conv.code,
    clientId: conv.client_id,
    intakeId: intake.id,
    phone,
    issues: [...detail.issues].sort((a, b) => a.number - b.number),
    docs: documents,
    detail,
  };
}

export async function assign(admin, caseId, body) {
  return ok(await admin.post(`/api/admin/cases/${caseId}/assignments`, body), 201, 'assign').assignment;
}

export const OPINION_TEXT = 'الرأي القانوني: بعد دراسة الوقائع المتاحة يتبين أن للعميل الحق في المطالبة، وننصح باتباع الخطوات التالية بالترتيب.';

/** Lawyer opens, drafts and submits; returns the submitted opinion id. */
export async function lawyerSubmits(lawyer, assignmentId, body = OPINION_TEXT, extra = {}) {
  ok(await lawyer.post(`/api/lawyer/assignments/${assignmentId}/open`), 200, 'open');
  const s = ok(await lawyer.post(`/api/lawyer/assignments/${assignmentId}/submit`, { body, ...extra }), 200, 'submit');
  assert.equal(s.status, 'submitted');
  return s.id;
}

export async function approveOpinion(admin, opinionId, body = { quality_score: 4 }) {
  return ok(await admin.post(`/api/admin/opinions/${opinionId}/approve`, body), 200, 'approve opinion');
}

/** Full happy path for one assignment: submit + approve. */
export async function submitAndApprove(admin, lawyer, assignmentId, text = OPINION_TEXT) {
  const opId = await lawyerSubmits(lawyer, assignmentId, text);
  return approveOpinion(admin, opId);
}

/** Every key used anywhere inside a JSON value. */
export function allKeys(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

/**
 * Assert that a JSON payload contains none of the forbidden keys (at any depth) and none of the
 * forbidden substrings anywhere in its serialized form.
 */
export function assertNoLeak(payload, { keys = [], values = [] }, label) {
  const found = allKeys(payload);
  const badKeys = keys.filter((k) => found.has(k));
  assert.deepEqual(badKeys, [], `${label}: forbidden keys present in lawyer response: ${badKeys.join(', ')}`);
  const s = JSON.stringify(payload);
  for (const v of values.filter(Boolean)) {
    assert.ok(!s.includes(v), `${label}: lawyer response leaks forbidden value «${v}»`);
  }
}

/** Keys that must never appear in any lawyer-facing response. */
export const LAWYER_FORBIDDEN_KEYS = [
  'phone', 'contact_phone', 'national_id', 'email', 'to_address',
  'messages', 'conversation', 'client_text',
  'source', 'source_detail', 'campaign', 'channel', 'channels', 'first_channel', 'referral', 'utm_source', 'utm_campaign',
  'internal_notes', 'facts_internal',
  'cost', 'case_cost', 'billing', 'ledger',
];

export function portalToken(portalUrl) {
  const m = /\/p\/([A-Za-z0-9_-]+)/.exec(portalUrl || '');
  assert.ok(m, `portal url not found in ${portalUrl}`);
  return m[1];
}

/** Issue a portal token for a client through the admin API. */
export async function portalFor(admin, clientId) {
  const r = ok(await admin.post(`/api/admin/clients/${clientId}/portal-link`, {}), 200, 'portal link');
  return portalToken(r.url);
}

/** POST a raw WhatsApp webhook payload (no app secret configured in tests). */
export async function postWebhook(t, payload) {
  const c = t.client();
  return c.post('/webhooks/whatsapp', payload);
}

export function waText(from, text, extra = {}) {
  return waPayload({ from: String(from).replace(/^\+/, '').replace(/^0/, '20'), text, ...extra });
}

export async function notificationsOf(c) {
  return ok(await c.get('/api/notifications?limit=200'), 200, 'notifications').items;
}

export async function outbox(admin) {
  return ok(await admin.get('/api/admin/outbox?limit=1000'), 200, 'outbox');
}

export async function caseDetail(admin, caseId) {
  return ok(await admin.get(`/api/admin/cases/${caseId}`), 200, 'case detail');
}

export async function runAutomations(admin) {
  return ok(await admin.post('/api/admin/automations/run'), 200, 'automations run');
}

/** ISO helper relative to a base instant. */
export function plusDays(iso, days) {
  return new Date(new Date(iso).getTime() + days * 86400000).toISOString();
}
export function plusHours(iso, hours) {
  return new Date(new Date(iso).getTime() + hours * 3600000).toISOString();
}

export { samplePdf };
