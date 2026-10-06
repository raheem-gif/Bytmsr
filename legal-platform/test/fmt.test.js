import { test } from 'node:test';

test('frontend Cairo time/format helpers self-check', async () => {
  await import('./fmt-selfcheck.mjs');
});
