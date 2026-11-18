// Seeds the fictional Proof Ledger demo into an Atlassian site.
// Every company here is invented. "Corvane Analytics" is the fictional vendor.
// Usage: SITE=https://your-site.atlassian.net ATL_EMAIL=... ATL_TOKEN=... node scripts/seed.mjs [--reset]
// Optional: JSM_PROJECT=CUST TASK_PROJECT=PROOF SPACE_KEY=MKT. Safe to re-run: it only creates what is
// missing and never changes non-demo records. --reset restores demo records and closes demo fix tasks.
// Most people do not need this script: admins can click "Load demo data" on the Proof Ledger page.
// Dates are relative to the day you run it, so the demo states (expiring, expired, over-asked) stay true.

// The demo content and the load/reset rules are shared with the in-app "Load demo data" action.
import { applyDemo, summarizeDemoReport, DEMO_PERMISSIONS } from '../src/demo.js';

const SITE = process.env.SITE;
const AUTH = 'Basic ' + Buffer.from(`${process.env.ATL_EMAIL}:${process.env.ATL_TOKEN}`).toString('base64');
const JSM_PROJECT = process.env.JSM_PROJECT || 'CUST';
const TASK_PROJECT = process.env.TASK_PROJECT || 'PROOF';
const SPACE_KEY = process.env.SPACE_KEY || 'MKT';
if (!SITE || !process.env.ATL_EMAIL || !process.env.ATL_TOKEN) throw new Error('Set SITE, ATL_EMAIL and ATL_TOKEN');

async function req(method, path, body) {
  const res = await fetch(SITE + path, {
    method,
    headers: { Authorization: AUTH, Accept: 'application/json', 'Content-Type': 'application/json', 'X-ExperimentalApi': 'opt-in' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}


const today = new Date().toISOString().slice(0, 10);
const qs = (o) => new URLSearchParams(o).toString();

const io = {
  listOrgs: async () => {
    const out = [];
    for (let start = 0; ; ) {
      const page = await req('GET', `/rest/servicedeskapi/organization?${qs({ start, limit: 50 })}`);
      out.push(...page.values);
      if (page.isLastPage || page.values.length === 0) return out;
      start += page.values.length;
    }
  },
  getRecord: async (id) => {
    try { return (await req('GET', `/rest/servicedeskapi/organization/${id}/property/proof-ledger`)).value || null; }
    catch (e) { if (String(e.message).includes('404')) return null; throw e; }
  },
  putRecord: (id, r) => req('PUT', `/rest/servicedeskapi/organization/${id}/property/proof-ledger`, r),
  createOrg: (name) => req('POST', '/rest/servicedeskapi/organization', { name }),
  findSpace: async (key) => {
    const s = (await req('GET', `/wiki/api/v2/spaces?${qs({ keys: key })}`)).results[0];
    return s ? { id: String(s.id), key: s.key } : null;
  },
  findPage: async (spaceId, title) => {
    const pg = (await req('GET', `/wiki/api/v2/spaces/${spaceId}/pages?${qs({ title, 'body-format': 'storage', status: 'current' })}`)).results[0];
    if (!pg) return null;
    const labels = await req('GET', `/wiki/api/v2/pages/${pg.id}/labels?limit=100`);
    return { id: String(pg.id), body: pg.body?.storage?.value || '', labels: (labels.results || []).map((l) => l.name), version: pg.version?.number };
  },
  createPage: async (spaceId, title, body) => String((await req('POST', '/wiki/api/v2/pages', { spaceId, status: 'current', title, body: { representation: 'storage', value: body } })).id),
  updatePage: (id, title, body, version) => req('PUT', `/wiki/api/v2/pages/${id}`, { id, status: 'current', title, body: { representation: 'storage', value: body }, version: { number: (version || 1) + 1, message: 'Proof Ledger demo seed' } }),
  addLabels: (id, labels) => req('POST', `/wiki/rest/api/content/${id}/label`, labels.map((name) => ({ prefix: 'global', name }))),
  searchIssues: async (jql) => ((await req('GET', `/rest/api/3/search/jql?${qs({ jql, fields: 'summary,labels', maxResults: 100 })}`)).issues || [])
    .map((i) => ({ key: i.key, summary: i.fields.summary, labels: i.fields.labels || [] })),
  createIssue: async (project, summary, labels) => {
    const meta = await req('GET', `/rest/api/3/issue/createmeta/${project}/issuetypes`);
    const types = meta.issueTypes || meta.values;
    const type = types.find((t) => t.name === 'Task') || types.find((t) => !t.subtask) || types[0];
    return (await req('POST', '/rest/api/3/issue', { fields: { project: { key: project }, issuetype: { id: type.id }, summary, labels } })).key;
  },
  addIssueLabels: (key, labels) => req('PUT', `/rest/api/3/issue/${key}`, { update: { labels: labels.map((l) => ({ add: l })) } }),
  getIssueProperty: async (key, prop) => {
    try { return (await req('GET', `/rest/api/3/issue/${key}/properties/${prop}`)).value ?? null; }
    catch (e) { if (String(e.message).includes('404')) return null; throw e; }
  },
  setIssueProperty: (key, prop, value) => req('PUT', `/rest/api/3/issue/${key}/properties/${prop}`, value),
  closeIssue: async (key) => {
    const tr = await req('GET', `/rest/api/3/issue/${key}/transitions`);
    const done = tr.transitions.find((t) => t.to?.statusCategory?.key === 'done');
    if (!done) return false;
    await req('POST', `/rest/api/3/issue/${key}/transitions`, { transition: { id: done.id } });
    return true;
  },
};

// Script-only extra: one synthetic JSM consent request per permission, so each record points at a ticket.
async function consentTickets() {
  const desks = await req('GET', '/rest/servicedeskapi/servicedesk');
  const desk = desks.values.find((d) => d.projectKey === JSM_PROJECT);
  if (!desk) {
    console.log(`No service desk ${JSM_PROJECT}; consent sources will be plain demo references.`);
    return {};
  }
  const types = await req('GET', `/rest/servicedeskapi/servicedesk/${desk.id}/requesttype`);
  const reqType = types.values.find((t) => /general|question|ask/i.test(t.name)) || types.values[0];
  const existing = await req('GET', `/rest/api/3/search/jql?${qs({ jql: `project = ${JSM_PROJECT} AND labels = proof-consent`, fields: 'summary', maxResults: 100 })}`);
  const bySummary = Object.fromEntries((existing.issues || []).map((i) => [i.fields.summary, i.key]));
  const keys = {};
  let n = 0;
  for (const [cust, assetType, channels] of DEMO_PERMISSIONS) {
    n++;
    const summary = `Consent: ${cust} ${assetType.replace('_', ' ')} (${channels.join(', ')})`;
    if (!bySummary[summary]) {
      const created = await req('POST', '/rest/servicedeskapi/request', {
        serviceDeskId: desk.id,
        requestTypeId: reqType.id,
        requestFieldValues: { summary, description: `Synthetic demo record. Fictional customer ${cust} agreed to ${assetType.replace('_', ' ')} use in: ${channels.join(', ')}.` },
      });
      bySummary[summary] = created.issueKey;
      await req('PUT', `/rest/api/3/issue/${created.issueKey}`, { update: { labels: [{ add: 'proof-consent' }] } });
    }
    keys[n] = bySummary[summary];
  }
  return { keys, desk };
}

async function main() {
  const reset = process.argv.includes('--reset');
  const { keys = {}, desk } = await consentTickets();
  const report = await applyDemo({ ...io, consentFor: (n) => keys[n] || null }, { today, taskProject: TASK_PROJECT, spaceKey: SPACE_KEY, reset, log: console.log });
  // Make the demo organizations visible in the service project too (ignored if already added).
  if (desk) {
    const orgs = (await io.listOrgs()).filter((o) => DEMO_PERMISSIONS.some(([c]) => c === o.name));
    for (const o of orgs) await req('POST', `/rest/servicedeskapi/servicedesk/${desk.id}/organization`, { organizationId: Number(o.id) }).catch(() => {});
  }
  console.log(summarizeDemoReport(report, reset));
  for (const s of report.skipped) console.log(`skipped: ${s}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
