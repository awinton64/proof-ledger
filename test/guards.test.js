import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installProduct, shouldRunDailySweep, noJsmError, scanPageForUser, DENIED, NO_JSM_MESSAGE } from '../src/guards.js';

test('install product is read from the installContext ARI', () => {
  assert.equal(installProduct({ installContext: 'ari:cloud:jira::site/abc-123' }), 'jira');
  assert.equal(installProduct({ installContext: 'ari:cloud:confluence::site/abc-123' }), 'confluence');
  assert.equal(installProduct({}), null);
  assert.equal(installProduct(undefined), null);
});

test('daily sweep runs in the Jira installation only (and when the context is unknown)', () => {
  assert.equal(shouldRunDailySweep({ installContext: 'ari:cloud:jira::site/x' }), true);
  assert.equal(shouldRunDailySweep({ installContext: 'ari:cloud:confluence::site/x' }), false);
  assert.equal(shouldRunDailySweep(null), true);
});

test('a 404 from the JSM organization API becomes a clear "needs Jira Service Management" error', () => {
  const e = noJsmError(new Error('Jira 404: {"errorMessage":"null"}'));
  assert.equal(e.code, 'NO_JSM');
  assert.equal(e.message, NO_JSM_MESSAGE);
  const other = new Error('Jira 500: boom');
  assert.equal(noJsmError(other), other);
});

const fakeScan = async (id) => ({ title: `Page ${id}`, url: `/p/${id}`, channel: 'website', status: 'CLEAR', summary: 'ok', findings: [{ excerpt: 'secret text' }] });

test('scan-page returns page content only when the user can view the page', async () => {
  const seen = [];
  const ok = await scanPageForUser('42', { canView: async (id) => { seen.push(id); return true; }, scan: fakeScan });
  assert.equal(ok.page, 'Page 42');
  assert.deepEqual(seen, ['42']);
});

test('scan-page denies without leaking title, URL or excerpts when the user cannot view the page', async () => {
  let scanned = false;
  const r = await scanPageForUser('42', { canView: async () => false, scan: async (id) => { scanned = true; return fakeScan(id); } });
  assert.deepEqual(r, { error: DENIED, denied: true });
  assert.equal(scanned, false);
});

test('scan-page denies when the permission check itself fails, and rejects non-numeric ids', async () => {
  const r = await scanPageForUser('42', { canView: async () => { throw new Error('no user context'); }, scan: fakeScan });
  assert.equal(r.denied, true);
  const bad = await scanPageForUser('42 OR 1=1', { canView: async () => true, scan: fakeScan });
  assert.match(bad.error, /numeric/);
});
