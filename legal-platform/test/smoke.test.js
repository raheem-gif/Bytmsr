import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, demoCode } from './helpers.js';

test('demo seed boots and staff can open the dashboard', async () => {
  const t = await startTestApp({ seed: 'demo' });
  try {
    const admin = await t.login('admin');
    const r = await admin.get('/api/admin/dashboard');
    assert.equal(r.status, 200);
    assert.ok(r.body.open_cases > 0);
    const c = await admin.get(`/api/admin/cases?q=${demoCode(t.app)}`); // v11 gate fixer-server (R-04, intended): بلا سنة ثابتة
    assert.equal(c.body.items[0].code.endsWith('-00482'), true);
  } finally {
    await t.close();
  }
});
