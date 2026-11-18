import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDemo, sameStorage, buildDemoRecords, isDemoRecord, isDemoPage, isDemoFixTask, DEMO_CUSTOMERS, DEMO_PAGES, DEMO_REQUESTS, DEMO_PERMISSIONS, DEMO_LABEL } from '../src/demo.js';
import { splitLedger, scanPage, evaluate } from '../src/engine.js';

const today = '2026-11-18';

// In-memory Atlassian site implementing the adapter used by applyDemo.
function fakeSite({ orgs = [], records = {}, pages = [], issues = [] } = {}) {
  let nextOrg = 100;
  let nextPage = 5000;
  let nextIssue = 1;
  const site = {
    orgs: orgs.map((o) => ({ ...o })),
    records: { ...records },
    pages: pages.map((p) => ({ labels: [], version: 1, ...p })),
    issues: issues.map((i) => ({ labels: [], props: {}, status: 'open', ...i })),
    writes: [],
  };
  const issueByKey = (k) => site.issues.find((i) => i.key === k);
  site.io = {
    listOrgs: async () => site.orgs.map((o) => ({ ...o })),
    getRecord: async (id) => (site.records[id] ? structuredClone(site.records[id]) : null),
    putRecord: async (id, r) => { site.writes.push(['record', id]); site.records[id] = structuredClone(r); },
    createOrg: async (name) => { const o = { id: nextOrg++, name }; site.orgs.push(o); site.writes.push(['org', name]); return o; },
    findSpace: async (key) => (key === 'MKT' ? { id: '9', key } : null),
    findPage: async (spaceId, title) => {
      const p = site.pages.find((x) => x.spaceId === spaceId && x.title === title);
      return p ? { id: p.id, body: p.body, labels: [...p.labels], version: p.version } : null;
    },
    createPage: async (spaceId, title, body) => { const id = String(nextPage++); site.pages.push({ id, spaceId, title, body, labels: [], version: 1 }); site.writes.push(['page', title]); return id; },
    updatePage: async (id, title, body) => { const p = site.pages.find((x) => x.id === id); p.body = body; p.version++; site.writes.push(['pageUpdate', title]); },
    addLabels: async (id, labels) => { const p = site.pages.find((x) => x.id === id); p.labels = [...new Set([...p.labels, ...labels])]; site.writes.push(['labels', p.title]); },
    searchIssues: async (jql) => {
      const project = /project = "([^"]+)"/.exec(jql)[1];
      const label = /labels = "([^"]+)"/.exec(jql)[1];
      const openOnly = jql.includes('statusCategory != Done');
      return site.issues.filter((i) => i.project === project && i.labels.includes(label) && (!openOnly || i.status !== 'done'))
        .map((i) => ({ key: i.key, summary: i.summary, labels: [...i.labels] }));
    },
    createIssue: async (project, summary, labels) => { const key = `${project}-${nextIssue++ + 100}`; site.issues.push({ key, project, summary, labels: [...labels], props: {}, status: 'open' }); site.writes.push(['issue', summary]); return key; },
    addIssueLabels: async (key, labels) => { const i = issueByKey(key); i.labels = [...new Set([...i.labels, ...labels])]; site.writes.push(['issueLabels', key]); },
    getIssueProperty: async (key, prop) => issueByKey(key)?.props[prop] ?? null,
    setIssueProperty: async (key, prop, value) => { issueByKey(key).props[prop] = structuredClone(value); site.writes.push(['issueProp', key]); },
    closeIssue: async (key) => { issueByKey(key).status = 'done'; site.writes.push(['close', key]); return true; },
  };
  return site;
}

const opts = { today, taskProject: 'PROOF', spaceKey: 'MKT' };
const orgId = (site, name) => String(site.orgs.find((o) => o.name === name).id);

// ---------- customer list filtering ----------

test('only organizations with a Proof Ledger record are customers; others are listed as untracked', () => {
  const orgs = [
    { id: 1, name: 'Brindlewood Freight' },
    { id: 2, name: 'atlassian.enterprises' },
    { id: 3, name: 'Campbell Lake Freight Inc' },
    { id: 4, name: 'New Customer With Empty Record' },
  ];
  const records = [{ status: 'active', permissions: [{ id: 'p1', assetType: 'logo', channels: ['website'] }], demo: true }, null, null, { permissions: [] }];
  const l = splitLedger(orgs, records);
  assert.deepEqual(l.customers.map((c) => c.name), ['Brindlewood Freight', 'New Customer With Empty Record']);
  assert.deepEqual(l.untracked.map((c) => c.name), ['atlassian.enterprises', 'Campbell Lake Freight Inc']);
  assert.equal(l.permissions.length, 1);
  assert.equal(l.permissions[0].customerId, '1');
  assert.equal(l.customers[0].demo, true);
  assert.equal(l.customers[1].demo, false);
});

test('untracked organizations are never matched by a page scan', () => {
  const l = splitLedger([{ id: 1, name: 'Brindlewood Freight' }, { id: 2, name: 'Campbell Lake Freight Inc' }], [{ permissions: [] }, null]);
  const r = scanPage({ title: 't', text: 'Campbell Lake Freight Inc and Brindlewood Freight use Tamberlit.', labels: ['channel-website'], customers: l.customers, permissions: l.permissions, today });
  assert.deepEqual([...new Set(r.findings.map((f) => f.customer))], ['Brindlewood Freight']);
});

// ---------- demo data shape ----------

test('demo data is fictional and complete', () => {
  assert.equal(DEMO_CUSTOMERS.length, 12);
  assert.equal(DEMO_PERMISSIONS.length, 20);
  assert.equal(DEMO_PAGES.length, 8);
  assert.equal(DEMO_REQUESTS.length, 6);
  for (const p of DEMO_PAGES) assert.ok(p.body.includes('Fictional demo content for Proof Ledger'), p.title);
  const recs = buildDemoRecords(today);
  for (const c of DEMO_CUSTOMERS) assert.equal(recs[c.name].demo, true);
  const ids = Object.values(recs).flatMap((r) => r.permissions.map((x) => x.id));
  assert.equal(new Set(ids).size, 20);
  assert.ok(ids.every((id) => id.startsWith('seed-')));
});

test('demo records keep their story: Brindlewood at its reference-call limit, Saltmarrow expiring, Thistlebrook expired', () => {
  const recs = buildDemoRecords(today);
  const asCustomers = DEMO_CUSTOMERS.map((c, i) => ({ id: String(i), name: c.name, status: 'active' }));
  const id = (n) => asCustomers.find((c) => c.name === n).id;
  const permissions = DEMO_CUSTOMERS.flatMap((c) => recs[c.name].permissions.map((p) => ({ ...p, customerId: id(c.name) })));
  const uses = DEMO_CUSTOMERS.flatMap((c) => recs[c.name].uses.map((u) => ({ ...u, customerId: id(c.name) })));
  const cust = (n) => asCustomers.find((c) => c.name === n);
  assert.equal(evaluate({ customer: cust('Brindlewood Freight'), permissions, uses, assetType: 'reference_call', channel: 'sales_call', today }).verdict, 'BLOCKED');
  const salt = evaluate({ customer: cust('Saltmarrow Hotels'), permissions, uses, assetType: 'logo', channel: 'website', today });
  assert.equal(salt.verdict, 'ALLOWED');
  assert.ok(salt.warnings.length > 0);
  assert.equal(evaluate({ customer: cust('Thistlebrook Retail'), permissions, uses, assetType: 'logo', channel: 'partner', today }).verdict, 'NEEDS_CONSENT');
  assert.equal(evaluate({ customer: cust('Quillmere Health'), permissions, uses, assetType: 'case_study', channel: 'case_study', today }).verdict, 'BLOCKED');
});

test('demo detection helpers', () => {
  assert.equal(isDemoRecord('Brindlewood Freight', null), true);
  assert.equal(isDemoRecord('Brindlewood Freight', { demo: true, permissions: [] }), true);
  assert.equal(isDemoRecord('Brindlewood Freight', { permissions: [{ id: 'seed-1' }] }), true, 'seeded before the flag existed');
  assert.equal(isDemoRecord('Brindlewood Freight', { permissions: [{ id: 'p123' }] }), false);
  assert.equal(isDemoRecord('Brindlewood Freight', { permissions: [] }), false);
  assert.equal(isDemoRecord('Kestrelmoor Energy', { permissions: [], segment: 'Energy', owner: 'Account team West' }), true);
  assert.equal(isDemoRecord('Kestrelmoor Energy', { permissions: [], segment: 'Energy', owner: 'Jane' }), false);
  assert.equal(isDemoRecord('Acme Real Customer', null), false);
  assert.equal(isDemoPage({ labels: [DEMO_LABEL], body: '' }), true);
  assert.equal(isDemoPage({ labels: [], body: '<p>Fictional demo content for Proof Ledger.</p>' }), true);
  assert.equal(isDemoPage({ labels: ['channel-website'], body: '<p>Our real homepage</p>' }), false);
  assert.equal(isDemoFixTask(['proof-fix', 'pl-55-7'], new Set(['7'])), true);
  assert.equal(isDemoFixTask(['proof-fix', 'pl-55-8'], new Set(['7'])), false);
  assert.equal(isDemoFixTask(['proof-fix', DEMO_LABEL], new Set()), true);
});

// ---------- load / reset ----------

test('load on an empty site creates the full demo', async () => {
  const site = fakeSite();
  const r = await applyDemo(site.io, opts);
  assert.equal(r.customers.created, 12);
  assert.equal(r.pages.created, 8);
  assert.equal(r.requests.created, 6);
  assert.deepEqual(r.skipped, []);
  assert.equal(Object.keys(site.records).length, 12);
  assert.ok(Object.values(site.records).every((x) => x.demo === true));
  assert.ok(site.pages.every((p) => p.labels.includes(DEMO_LABEL)));
  const paid = site.pages.find((p) => p.title === 'Q1 paid social ad copy');
  assert.ok(paid.labels.includes('channel-paid-ads'));
  const req = site.issues.find((i) => i.summary === 'Reference call for a logistics prospect');
  assert.equal(req.props['proof-request'].customerId, orgId(site, 'Brindlewood Freight'));
  assert.ok(req.labels.includes('proof-request') && req.labels.includes(DEMO_LABEL));
});

test('load is idempotent: a second run writes nothing', async () => {
  const site = fakeSite();
  await applyDemo(site.io, opts);
  const snapshot = JSON.stringify({ orgs: site.orgs, records: site.records, pages: site.pages, issues: site.issues });
  site.writes.length = 0;
  const r = await applyDemo(site.io, opts);
  assert.deepEqual(site.writes, []);
  assert.equal(JSON.stringify({ orgs: site.orgs, records: site.records, pages: site.pages, issues: site.issues }), snapshot);
  assert.equal(r.customers.kept, 12);
  assert.equal(r.pages.kept, 8);
  assert.equal(r.requests.kept, 6);
});

test('load keeps changes made while trying the demo; reset restores them', async () => {
  const site = fakeSite();
  await applyDemo(site.io, opts);
  const orrin = orgId(site, 'Orrinvale Credit Union');
  site.records[orrin].status = 'churned';
  const paid = site.pages.find((p) => p.title === 'Q1 paid social ad copy');
  paid.body += '<p>edited</p>';
  await applyDemo(site.io, opts);
  assert.equal(site.records[orrin].status, 'churned');
  const r = await applyDemo(site.io, { ...opts, reset: true });
  assert.equal(site.records[orrin].status, 'active');
  assert.ok(!paid.body.includes('edited'));
  assert.equal(r.customers.updated, 12);
  assert.equal(r.pages.updated, 1);
  assert.equal(r.requests.updated, 6);
});

test('never touches non-demo records', async () => {
  const site = fakeSite({
    orgs: [
      { id: 1, name: 'Brindlewood Freight' }, // same name as a demo customer, but real data
      { id: 2, name: 'atlassian.enterprises' },
      { id: 3, name: 'Real Customer Inc' },
    ],
    records: {
      1: { status: 'active', permissions: [{ id: 'p-real', assetType: 'logo', channels: ['press'] }], uses: [] },
      3: { status: 'churned', permissions: [{ id: 'p-x', assetType: 'quote', channels: ['website'] }], uses: [] },
    },
    pages: [
      { id: '1', spaceId: '9', title: 'Q1 paid social ad copy', body: '<p>Our real ad copy</p>', labels: ['channel-paid-ads'] },
      { id: '2', spaceId: '9', title: 'Real roadmap', body: '<p>Brindlewood Freight</p>' },
    ],
    issues: [
      { key: 'PROOF-1', project: 'PROOF', summary: 'Reference call for a logistics prospect', labels: ['proof-request'], props: { 'proof-request': { customerId: '1' } } },
      { key: 'PROOF-2', project: 'PROOF', summary: 'Fix customer proof: Real Customer Inc churned on "Real roadmap"', labels: ['proof-ledger', 'proof-fix', 'pl-2-3'] },
    ],
  });
  const before = structuredClone({ r1: site.records[1], r3: site.records[3], p1: site.pages[0], p2: site.pages[1], i1: site.issues[0], i2: site.issues[1] });
  for (const reset of [false, true]) {
    const r = await applyDemo(site.io, { ...opts, reset });
    assert.ok(r.skipped.some((s) => s.includes('Brindlewood Freight')));
    assert.ok(r.skipped.some((s) => s.includes('Q1 paid social ad copy')));
  }
  assert.deepEqual(site.records[1], before.r1);
  assert.deepEqual(site.records[3], before.r3);
  assert.equal(site.records[2], undefined, 'unrelated org not added to the ledger');
  assert.deepEqual(site.pages[0], before.p1);
  assert.deepEqual(site.pages[1], before.p2);
  assert.deepEqual(site.issues[0], before.i1);
  assert.deepEqual(site.issues[1], before.i2);
  // Brindlewood was skipped, so its demo request is not created against the real organization.
  assert.ok(!site.issues.some((i) => i.key !== 'PROOF-1' && i.summary === 'Reference call for a logistics prospect'));
  assert.equal(site.orgs.filter((o) => o.name === 'Brindlewood Freight').length, 1);
});

test('reset closes only fix tasks raised for demo customers', async () => {
  const site = fakeSite({ orgs: [{ id: 3, name: 'Real Customer Inc' }], records: { 3: { permissions: [{ id: 'p-x' }] } } });
  await applyDemo(site.io, opts);
  const orrin = orgId(site, 'Orrinvale Credit Union');
  site.issues.push(
    { key: 'PROOF-50', project: 'PROOF', summary: 'demo fix', labels: ['proof-fix', `pl-77-${orrin}`, DEMO_LABEL], props: {}, status: 'open' },
    { key: 'PROOF-51', project: 'PROOF', summary: 'legacy demo fix', labels: ['proof-fix', `pl-78-${orrin}`], props: {}, status: 'open' },
    { key: 'PROOF-52', project: 'PROOF', summary: 'real fix', labels: ['proof-fix', 'pl-79-3'], props: {}, status: 'open' },
  );
  const r = await applyDemo(site.io, { ...opts, reset: true });
  assert.equal(r.fixTasksClosed, 2);
  assert.equal(site.issues.find((i) => i.key === 'PROOF-52').status, 'open');
  // Plain load never closes anything.
  site.issues.find((i) => i.key === 'PROOF-50').status = 'open';
  await applyDemo(site.io, opts);
  assert.equal(site.issues.find((i) => i.key === 'PROOF-50').status, 'open');
});

test('adopts a site seeded before the demo flag existed, keeping consent sources', async () => {
  const legacy = buildDemoRecords('2026-11-01', { consentFor: (n) => `CUST-${n}` });
  const orgs = DEMO_CUSTOMERS.map((c, i) => ({ id: i + 1, name: c.name }));
  const records = Object.fromEntries(orgs.map((o) => {
    const { demo, ...rest } = legacy[o.name];
    return [o.id, rest];
  }));
  const pages = DEMO_PAGES.map((p, i) => ({ id: String(i + 1), spaceId: '9', title: p.title, body: p.body, labels: p.labels }));
  const issues = DEMO_REQUESTS.map((r, i) => ({ key: `PROOF-${i + 1}`, project: 'PROOF', summary: r.summary, labels: ['proof-request'], props: { 'proof-request': { customerId: String(orgs.find((o) => o.name === r.customer).id) } } }));
  const site = fakeSite({ orgs, records, pages, issues });
  const r = await applyDemo(site.io, opts);
  assert.deepEqual(r.skipped, []);
  assert.equal(r.customers.created, 0);
  assert.equal(r.pages.created, 0);
  assert.equal(r.requests.created, 0);
  assert.equal(site.orgs.length, 12);
  assert.ok(Object.values(site.records).every((x) => x.demo === true));
  assert.equal(site.records[1].permissions[0].consentSource, 'CUST-1');
  assert.ok(site.pages.every((p) => p.labels.includes(DEMO_LABEL)));
  assert.ok(site.issues.every((i) => i.labels.includes(DEMO_LABEL)));
});

test('clear errors when the space or project is missing', async () => {
  const site = fakeSite();
  await assert.rejects(applyDemo(site.io, { ...opts, spaceKey: 'NOPE' }), /space NOPE was not found/);
  await assert.rejects(applyDemo(site.io, { ...opts, taskProject: '' }), /Jira project/);
  assert.deepEqual(site.writes, []);
});

test('page bodies compare equal after Confluence entity encoding', () => {
  const ours = '<p>“With Tamberlit, it works.” - Ops</p>';
  assert.equal(sameStorage(ours, '<p>&ldquo;With Tamberlit, it works.&rdquo; - Ops</p>'), true);
  assert.equal(sameStorage(ours, '<p>&#8220;With Tamberlit, it works.&#8221;  - Ops</p>'), true);
  assert.equal(sameStorage(ours, '<p>&ldquo;With Tamberlit, it changed.&rdquo; - Ops</p>'), false);
});

// ---------- retiring demo records from an earlier version (renamed fictional customers) ----------

test('load retires an old demo customer whose name changed and moves its proof request to the new name', async () => {
  const site = fakeSite();
  await applyDemo(site.io, opts);
  // Simulate an older demo: one demo customer under a former fictional name, with its request.
  const renamedReq = DEMO_REQUESTS.find((r) => r.purpose === 'Q1 paid social');
  const current = site.orgs.find((o) => o.name === renamedReq.customer);
  current.name = 'Old Fictional Insurer';
  const issue = site.issues.find((i) => i.summary === renamedReq.summary);
  issue.summary = 'Old demo request title';
  site.issues.push({ key: 'PROOF-900', project: 'PROOF', summary: 'Fix proof', labels: ['proof-fix', `pl-5000-${current.id}`], props: {}, status: 'open' });
  site.io.deleteOrg = async (id) => { site.orgs = site.orgs.filter((o) => String(o.id) !== String(id)); delete site.records[id]; site.writes.push(['deleteOrg', id]); };
  site.io.renameIssue = async (key, summary) => { site.issues.find((i) => i.key === key).summary = summary; site.writes.push(['rename', key]); };

  const r = await applyDemo(site.io, { ...opts, reset: true });
  assert.equal(r.customers.retired, 1);
  assert.equal(site.orgs.some((o) => o.name === 'Old Fictional Insurer'), false);
  const newOrg = site.orgs.find((o) => o.name === renamedReq.customer);
  assert.ok(newOrg);
  assert.equal(issue.summary, renamedReq.summary);
  assert.equal(String(issue.props['proof-request'].customerId), String(newOrg.id));
  assert.equal(site.issues.filter((i) => i.summary === renamedReq.summary).length, 1, 'no duplicate request');
  assert.equal(site.issues.find((i) => i.key === 'PROOF-900').status, 'done', 'fix task of the retired customer is closed');
});

test('organizations without demo: true are never retired, even with unknown names', async () => {
  const site = fakeSite({ orgs: [{ id: 7, name: 'Real Customer Inc' }], records: { 7: { permissions: [], status: 'active' } } });
  site.io.deleteOrg = async () => { throw new Error('must not delete'); };
  const r = await applyDemo(site.io, opts);
  assert.equal(r.customers.retired, 0);
  assert.ok(site.orgs.some((o) => o.name === 'Real Customer Inc'));
});
