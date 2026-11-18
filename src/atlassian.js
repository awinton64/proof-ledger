// Data access. The ledger lives on Jira Service Management customer organizations as an
// organization property, so the Jira and Confluence installations of this app (which have
// separate Forge storage) read and write the same records, and the data never leaves the site.
import api, { route } from '@forge/api';
import { htmlToText } from './engine';

export const PROP = 'proof-ledger';
const EMPTY = { aliases: [], status: 'active', segment: '', owner: '', permissions: [], uses: [] };

async function jira(path, opts = {}) {
  const res = await api.asApp().requestJira(path, {
    ...opts,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-ExperimentalApi': 'opt-in', ...(opts.headers || {}) },
  });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`Jira ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function confluence(path, opts = {}) {
  const res = await api.asApp().requestConfluence(path, {
    ...opts,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Confluence ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ---------- customers (JSM organizations) ----------

export async function listOrganizations() {
  const out = [];
  let start = 0;
  for (let i = 0; i < 20; i++) {
    const page = await jira(route`/rest/servicedeskapi/organization?start=${start}&limit=50`);
    out.push(...page.values);
    if (page.isLastPage || page.values.length === 0) break;
    start += page.values.length;
  }
  return out;
}

export async function getLedgerRecord(orgId) {
  try {
    const p = await jira(route`/rest/servicedeskapi/organization/${orgId}/property/${PROP}`);
    return { ...EMPTY, ...(p?.value || {}) };
  } catch (e) {
    if (String(e.message).includes('404')) return { ...EMPTY };
    throw e;
  }
}

export async function putLedgerRecord(orgId, record) {
  await jira(route`/rest/servicedeskapi/organization/${orgId}/property/${PROP}`, { method: 'PUT', body: JSON.stringify(record) });
}

export async function loadLedger() {
  const orgs = await listOrganizations();
  const records = await Promise.all(orgs.map((o) => getLedgerRecord(o.id)));
  const customers = [];
  const permissions = [];
  const uses = [];
  orgs.forEach((o, i) => {
    const r = records[i];
    customers.push({ id: String(o.id), name: o.name, aliases: r.aliases || [], status: r.status || 'active', churnedAt: r.churnedAt || null, segment: r.segment || '', owner: r.owner || '', renewalAtRisk: !!r.renewalAtRisk, doNotContact: !!r.doNotContact, tracked: (r.permissions || []).length > 0 });
    for (const p of r.permissions || []) permissions.push({ ...p, customerId: String(o.id) });
    for (const u of r.uses || []) uses.push({ ...u, customerId: String(o.id) });
  });
  return { customers, permissions, uses };
}

export async function updateLedgerRecord(orgId, fn) {
  const current = await getLedgerRecord(orgId);
  const next = fn(current) || current;
  await putLedgerRecord(orgId, next);
  return next;
}

export async function createOrganization(name) {
  return jira(route`/rest/servicedeskapi/organization`, { method: 'POST', body: JSON.stringify({ name }) });
}

// ---------- Confluence pages ----------

export async function getPage(pageId) {
  const page = await confluence(route`/wiki/api/v2/pages/${pageId}?body-format=storage`);
  const labels = await confluence(route`/wiki/api/v2/pages/${pageId}/labels?limit=100`);
  const base = page._links?.base || '';
  return {
    pageId: String(page.id),
    title: page.title,
    spaceId: page.spaceId,
    version: page.version?.number,
    text: htmlToText(page.body?.storage?.value || ''),
    labels: (labels.results || []).map((l) => l.name),
    url: page._links?.webui ? `${base}${page._links.webui}` : null,
  };
}

// CQL search for current pages. Returns [{ id, title }].
export async function searchPages(cql, limit = 50) {
  const res = await confluence(route`/wiki/rest/api/content/search?cql=${cql}&limit=${limit}`);
  return (res.results || []).map((r) => ({ id: String(r.id), title: r.title }));
}

export async function setPageScanProperty(pageId, value) {
  const key = 'proof-ledger-scan';
  const existing = await confluence(route`/wiki/api/v2/pages/${pageId}/properties?key=${key}`);
  const prop = existing.results?.[0];
  if (prop) {
    await confluence(route`/wiki/api/v2/pages/${pageId}/properties/${prop.id}`, { method: 'PUT', body: JSON.stringify({ key, value, version: { number: prop.version.number + 1 } }) });
  } else {
    await confluence(route`/wiki/api/v2/pages/${pageId}/properties`, { method: 'POST', body: JSON.stringify({ key, value }) });
  }
}

// ---------- Jira issues ----------

export async function getIssueProperty(issueKey, key) {
  try {
    const p = await jira(route`/rest/api/3/issue/${issueKey}/properties/${key}`);
    return p?.value ?? null;
  } catch (e) {
    if (String(e.message).includes('404')) return null;
    throw e;
  }
}

export async function setIssueProperty(issueKey, key, value) {
  await jira(route`/rest/api/3/issue/${issueKey}/properties/${key}`, { method: 'PUT', body: JSON.stringify(value) });
}

export async function getIssueBasics(issueKey) {
  const i = await jira(route`/rest/api/3/issue/${issueKey}?fields=summary,status,labels`);
  return { key: i.key, summary: i.fields.summary, status: i.fields.status?.name, labels: i.fields.labels || [] };
}

export async function searchIssues(jql, fields = 'summary,status,labels,created') {
  const res = await jira(route`/rest/api/3/search/jql?jql=${jql}&fields=${fields}&maxResults=100`);
  return res.issues || [];
}

export async function createTask({ projectKey, summary, description, labels }) {
  const meta = await jira(route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`);
  const types = meta.issueTypes || meta.values || [];
  const type = types.find((t) => t.name === 'Task') || types.find((t) => !t.subtask) || types[0];
  const body = {
    fields: {
      project: { key: projectKey },
      issuetype: { id: type.id },
      summary: summary.slice(0, 250),
      labels,
      description: {
        type: 'doc',
        version: 1,
        content: description.split('\n').filter(Boolean).map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] })),
      },
    },
  };
  return jira(route`/rest/api/3/issue`, { method: 'POST', body: JSON.stringify(body) });
}
