// Data access. The ledger lives on Jira Service Management customer organizations as an
// organization property, so the Jira and Confluence installations of this app (which have
// separate Forge storage) read and write the same records, and the data never leaves the site.
import api, { route } from '@forge/api';
import { htmlToText, splitLedger } from './engine';
import { noJsmError } from './guards';

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
    let page;
    try {
      page = await jira(route`/rest/servicedeskapi/organization?start=${start}&limit=50`);
    } catch (e) {
      throw noJsmError(e);
    }
    out.push(...page.values);
    if (page.isLastPage || page.values.length === 0) break;
    start += page.values.length;
  }
  return out;
}

// The raw record, or null when the organization is not in the ledger (no property yet).
export async function getRawLedgerRecord(orgId) {
  try {
    const p = await jira(route`/rest/servicedeskapi/organization/${orgId}/property/${PROP}`);
    return p?.value || null;
  } catch (e) {
    if (String(e.message).includes('404')) return null;
    throw e;
  }
}

export async function getLedgerRecord(orgId) {
  return { ...EMPTY, ...((await getRawLedgerRecord(orgId)) || {}) };
}

export async function putLedgerRecord(orgId, record) {
  await jira(route`/rest/servicedeskapi/organization/${orgId}/property/${PROP}`, { method: 'PUT', body: JSON.stringify(record) });
}

// Only organizations that carry a Proof Ledger record are customers of the ledger. Other JSM
// organizations on the site are returned separately as `untracked`, so they can be added.
export async function loadLedger() {
  const orgs = await listOrganizations();
  const records = await Promise.all(orgs.map((o) => getRawLedgerRecord(o.id)));
  return splitLedger(orgs, records);
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

// ---------- demo data and setup helpers ----------

export async function listSpaces() {
  const res = await confluence(route`/wiki/api/v2/spaces?limit=100&type=global&status=current`);
  return (res.results || []).map((s) => ({ id: String(s.id), key: s.key, name: s.name }));
}

export async function findSpace(key) {
  const res = await confluence(route`/wiki/api/v2/spaces?keys=${key}`);
  const s = res.results?.[0];
  return s ? { id: String(s.id), key: s.key } : null;
}

export async function findPageByTitle(spaceId, title) {
  const res = await confluence(route`/wiki/api/v2/spaces/${spaceId}/pages?title=${title}&body-format=storage&status=current`);
  const page = res.results?.[0];
  if (!page) return null;
  const labels = await confluence(route`/wiki/api/v2/pages/${page.id}/labels?limit=100`);
  return { id: String(page.id), body: page.body?.storage?.value || '', labels: (labels.results || []).map((l) => l.name), version: page.version?.number };
}

export async function createPage(spaceId, title, body) {
  const res = await confluence(route`/wiki/api/v2/pages`, { method: 'POST', body: JSON.stringify({ spaceId, status: 'current', title, body: { representation: 'storage', value: body } }) });
  return String(res.id);
}

export async function updatePage(id, title, body, version) {
  await confluence(route`/wiki/api/v2/pages/${id}`, { method: 'PUT', body: JSON.stringify({ id, status: 'current', title, body: { representation: 'storage', value: body }, version: { number: (version || 1) + 1, message: 'Proof Ledger demo data' } }) });
}

export async function addPageLabels(id, labels) {
  await confluence(route`/wiki/rest/api/content/${id}/label`, { method: 'POST', body: JSON.stringify(labels.map((name) => ({ prefix: 'global', name }))) });
}

export async function listProjects() {
  const res = await jira(route`/rest/api/3/project/search?maxResults=100&orderBy=key`);
  return (res.values || []).map((p) => ({ key: p.key, name: p.name, type: p.projectTypeKey }));
}

export async function createIssue(projectKey, summary, labels) {
  const meta = await jira(route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`);
  const types = meta.issueTypes || meta.values || [];
  const type = types.find((t) => t.name === 'Task') || types.find((t) => !t.subtask) || types[0];
  const res = await jira(route`/rest/api/3/issue`, { method: 'POST', body: JSON.stringify({ fields: { project: { key: projectKey }, issuetype: { id: type.id }, summary, labels } }) });
  return res.key;
}

export async function addIssueLabels(key, labels) {
  await jira(route`/rest/api/3/issue/${key}`, { method: 'PUT', body: JSON.stringify({ update: { labels: labels.map((l) => ({ add: l })) } }) });
}

export async function closeIssue(key) {
  const tr = await jira(route`/rest/api/3/issue/${key}/transitions`);
  const done = (tr.transitions || []).find((t) => t.to?.statusCategory?.key === 'done');
  if (!done) return false;
  await jira(route`/rest/api/3/issue/${key}/transitions`, { method: 'POST', body: JSON.stringify({ transition: { id: done.id } }) });
  return true;
}

// Is the signed-in user a Jira administrator? Checked as the user, not as the app.
export async function currentUserIsAdmin() {
  const res = await api.asUser().requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return false;
  const body = await res.json();
  return !!body?.permissions?.ADMINISTER?.havePermission;
}

// Can the invoking user open this Confluence page? Read the page as the user (not as the app):
// Confluence applies space permissions and page restrictions. Used before a Rovo action or MCP tool
// returns page content. With no user context the answer is no.
export async function userCanViewPage(pageId, accountId = null) {
  const attempts = [() => api.asUser(), ...(accountId ? [() => api.asUser(accountId)] : [])];
  for (const make of attempts) {
    try {
      const res = await make().requestConfluence(route`/wiki/api/v2/pages/${pageId}`, { headers: { Accept: 'application/json' } });
      if (res.ok) return true;
      if ([401, 403, 404].includes(res.status)) return false;
    } catch (e) {
      // No user context in this invocation (or no consent): try the next way, then deny.
      console.warn(`asUser page check failed: ${e.message}`);
    }
  }
  return false;
}

export async function deleteOrganization(orgId) {
  await jira(route`/rest/servicedeskapi/organization/${orgId}`, { method: 'DELETE' });
}

export async function renameIssue(key, summary) {
  await jira(route`/rest/api/3/issue/${key}`, { method: 'PUT', body: JSON.stringify({ fields: { summary } }) });
}

export async function deleteLedgerRecord(orgId) {
  await jira(route`/rest/servicedeskapi/organization/${orgId}/property/${PROP}`, { method: 'DELETE' });
}
