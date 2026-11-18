// Business logic shared by the UI resolvers, triggers, Rovo actions and MCP tools.
import { kvs } from '@forge/kvs';
import { evaluate, scanPage, dashboard, referenceable, ASSET_TYPES, CHANNELS, isoDay, permissionState } from './engine';
import * as atl from './atlassian';
import { applyDemo, summarizeDemoReport, DEMO_LABEL, DEMO_CUSTOMERS } from './demo';

export const REQUEST_PROP = 'proof-request';
const SETTINGS_KEY = 'settings';
const DEFAULT_SETTINGS = { taskProject: 'PROOF', demoSpaceKey: 'MKT' };

export const today = () => isoDay(new Date());

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...((await kvs.get(SETTINGS_KEY)) || {}) };
}

export async function saveSettings(s) {
  const next = { ...(await getSettings()), ...s };
  await kvs.set(SETTINGS_KEY, next);
  return next;
}

export function findCustomer(customers, nameOrId) {
  if (!nameOrId) return null;
  const q = String(nameOrId).trim().toLowerCase();
  return customers.find((c) => c.id === String(nameOrId))
    || customers.find((c) => c.name.toLowerCase() === q)
    || customers.find((c) => (c.aliases || []).some((a) => a.toLowerCase() === q))
    || customers.find((c) => c.name.toLowerCase().includes(q))
    || null;
}

function normKey(map, value) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (map[v]) return v;
  const byLabel = Object.entries(map).find(([, label]) => label.toLowerCase() === String(value).trim().toLowerCase());
  return byLabel ? byLabel[0] : null;
}
export const normAsset = (v) => normKey(ASSET_TYPES, v);
export const normChannel = (v) => normKey(CHANNELS, v);

// ---------- verdicts ----------

export async function checkProof({ customer, assetType, channel, quoteText }) {
  const ledger = await atl.loadLedger();
  const c = findCustomer(ledger.customers, customer);
  const a = normAsset(assetType);
  const ch = normChannel(channel);
  if (!a) return { verdict: 'UNKNOWN_INPUT', reasons: [`Asset type must be one of: ${Object.keys(ASSET_TYPES).join(', ')}.`] };
  if (channel && !ch) return { verdict: 'UNKNOWN_INPUT', reasons: [`Channel must be one of: ${Object.keys(CHANNELS).join(', ')}.`] };
  const v = evaluate({ customer: c, permissions: ledger.permissions, uses: ledger.uses, assetType: a, channel: ch, today: today(), quoteText: quoteText || null });
  return {
    customer: c ? c.name : customer,
    assetType: a,
    channel: ch,
    verdict: v.verdict,
    reasons: v.reasons,
    warnings: v.warnings,
    approvedText: v.permission?.approvedText || null,
    expiresOn: v.permission?.expiresOn || null,
    consentSource: v.permission?.consentSource || null,
    checkedOn: today(),
  };
}

export async function listReferenceable({ assetType, channel, segment }) {
  const ledger = await atl.loadLedger();
  const a = normAsset(assetType) || 'logo';
  const ch = normChannel(channel);
  return {
    assetType: a,
    channel: ch,
    segment: segment || null,
    checkedOn: today(),
    customers: referenceable({ ...ledger, assetType: a, channel: ch, today: today(), segment: segment || null }),
  };
}

// ---------- Confluence scanning ----------

export async function scanById(pageId, { ledger = null, persist = true } = {}) {
  const l = ledger || (await atl.loadLedger());
  const page = await atl.getPage(pageId);
  const result = scanPage({ ...page, customers: l.customers, permissions: l.permissions, uses: l.uses, today: today() });
  const record = { pageId: page.pageId, title: page.title, url: page.url, labels: page.labels, version: page.version, scannedOn: new Date().toISOString(), ...result };
  if (persist) {
    try {
      await atl.setPageScanProperty(page.pageId, { status: record.status, summary: record.summary, scannedOn: record.scannedOn, count: record.findings.length });
    } catch (e) {
      console.warn(`could not store scan property on ${page.pageId}: ${e.message}`);
    }
  }
  return record;
}

// Scan every page that names a ledger customer (CQL text search), capped.
export async function scanAll({ limit = 60 } = {}) {
  const ledger = await atl.loadLedger();
  const ids = new Map();
  for (const c of ledger.customers) {
    const pages = await atl.searchPages(`type=page AND text ~ "\\"${c.name.replace(/"/g, '')}\\""`, 25);
    for (const p of pages) ids.set(p.id, p.title);
    if (ids.size >= limit) break;
  }
  const scans = [];
  for (const id of [...ids.keys()].slice(0, limit)) {
    try {
      scans.push(await scanById(id, { ledger, persist: true }));
    } catch (e) {
      console.warn(`scan failed for page ${id}: ${e.message}`);
    }
  }
  await kvs.set('lastScan', { at: new Date().toISOString(), scans: scans.map(slimScan) });
  return scans;
}

function slimScan(s) {
  return { pageId: s.pageId, title: s.title, url: s.url, channel: s.channel, status: s.status, summary: s.summary, findings: s.findings.map((f) => ({ customerId: f.customerId, customer: f.customer, kind: f.kind, verdict: f.verdict, reasons: f.reasons, excerpt: f.excerpt, fix: f.fix })) };
}

export async function getDashboard(preloaded = null) {
  const ledger = preloaded || (await atl.loadLedger());
  const last = (await kvs.get('lastScan')) || { at: null, scans: [] };
  const d = dashboard({ ...ledger, scans: last.scans, today: today() });
  return { ...d, lastScanAt: last.at, lastSweep: (await kvs.get('lastSweep')) || null, today: today() };
}

// ---------- churn and expiry sweep ----------

// Affected = churned customers, plus customers with a permission that expired or was revoked.
// For each, find pages that still name them in a channel that now fails, and raise one Jira task
// per page and customer (deduplicated with a label), plus a comment on open proof requests.
export async function sweep({ reason = 'manual', onlyCustomerId = null } = {}) {
  const settings = await getSettings();
  const ledger = await atl.loadLedger();
  const t = today();
  const affected = ledger.customers.filter((c) => (!onlyCustomerId || c.id === String(onlyCustomerId))).filter((c) => c.status === 'churned'
    || ledger.permissions.some((p) => p.customerId === c.id && ['expired', 'revoked'].includes(permissionState(p, t))));
  const created = [];
  const existing = [];
  const pagesChecked = new Set();
  for (const c of affected) {
    const pages = await atl.searchPages(`type=page AND text ~ "\\"${c.name.replace(/"/g, '')}\\""`, 25);
    for (const p of pages) {
      pagesChecked.add(p.id);
      const scan = await scanById(p.id, { ledger, persist: true });
      const hits = scan.findings.filter((f) => f.customerId === c.id && (f.verdict === 'BLOCKED' || f.verdict === 'NEEDS_CONSENT'));
      if (!hits.length) continue;
      const label = `pl-${p.id}-${c.id}`;
      const dupes = await atl.searchIssues(`project = "${settings.taskProject}" AND labels = "${label}" AND statusCategory != Done`, 'summary');
      if (dupes.length) {
        existing.push({ key: dupes[0].key, page: scan.title, customer: c.name });
        continue;
      }
      const why = c.status === 'churned' ? `${c.name} churned` : `${c.name} permission no longer covers this use`;
      const issue = await atl.createTask({
        projectKey: settings.taskProject,
        summary: `Fix customer proof: ${why} on "${scan.title}"`,
        labels: ['proof-ledger', 'proof-fix', label, ...(c.demo ? [DEMO_LABEL] : [])],
        description: [
          `Proof Ledger found ${hits.length} use(s) of ${c.name} on the Confluence page "${scan.title}" that are no longer allowed (${scan.channel ? CHANNELS[scan.channel] : 'unlabeled'} channel).`,
          scan.url ? `Page: ${scan.url}` : '',
          ...hits.map((h) => `- ${ASSET_TYPES[h.kind] || h.kind}: ${h.reasons.join(' ')} Fix: ${h.fix} Excerpt: ${h.excerpt}`),
          `Raised by the Proof Ledger sweep (${reason}) on ${t}. Deterministic rule check; no AI was used.`,
        ].join('\n'),
      });
      created.push({ key: issue.key, page: scan.title, customer: c.name });
    }
  }
  const result = { at: new Date().toISOString(), reason, affected: affected.map((c) => c.name), pagesChecked: pagesChecked.size, created, existing };
  await kvs.set('lastSweep', result);
  return result;
}

// ---------- proof requests (Jira issue panel) ----------

export async function getRequest(issueKey) {
  const [req, ledger] = await Promise.all([atl.getIssueProperty(issueKey, REQUEST_PROP), atl.loadLedger()]);
  let verdict = null;
  if (req?.customerId && req?.assetType) {
    const c = ledger.customers.find((x) => x.id === req.customerId);
    verdict = evaluate({ customer: c, permissions: ledger.permissions, uses: ledger.uses.filter((u) => u.requestKey !== issueKey), assetType: req.assetType, channel: req.channel, today: today(), quoteText: req.quoteText || null });
    verdict = { verdict: verdict.verdict, reasons: verdict.reasons, warnings: verdict.warnings, expiresOn: verdict.permission?.expiresOn || null, approvedText: verdict.permission?.approvedText || null };
  }
  const logged = req?.customerId ? ledger.uses.some((u) => u.requestKey === issueKey) : false;
  return {
    request: req,
    verdict,
    logged,
    customers: ledger.customers.map((c) => ({ id: c.id, name: c.name, status: c.status })),
    assetTypes: ASSET_TYPES,
    channels: CHANNELS,
  };
}

export async function saveRequest(issueKey, { customerId, assetType, channel, quoteText, purpose }) {
  await atl.setIssueProperty(issueKey, REQUEST_PROP, { customerId: String(customerId), assetType, channel, quoteText: quoteText || '', purpose: purpose || '', savedOn: today() });
  return getRequest(issueKey);
}

export async function logUse(issueKey) {
  const req = await atl.getIssueProperty(issueKey, REQUEST_PROP);
  if (!req?.customerId) throw new Error('Save the request first.');
  const current = await getRequest(issueKey);
  if (current.verdict?.verdict !== 'ALLOWED') throw new Error('Only allowed requests can be logged as used.');
  await atl.updateLedgerRecord(req.customerId, (r) => ({ ...r, uses: [...(r.uses || []).filter((u) => u.requestKey !== issueKey), { assetType: req.assetType, channel: req.channel, date: today(), requestKey: issueKey }] }));
  return getRequest(issueKey);
}

// ---------- ledger edits (global page) ----------

export async function getLedgerView(preloaded = null) {
  const ledger = preloaded || (await atl.loadLedger());
  const t = today();
  return {
    today: t,
    customers: ledger.customers,
    untracked: ledger.untracked,
    permissions: ledger.permissions.map((p) => ({ ...p, state: permissionState(p, t), customer: ledger.customers.find((c) => c.id === p.customerId)?.name })),
    uses: ledger.uses,
    assetTypes: ASSET_TYPES,
    channels: CHANNELS,
    settings: await getSettings(),
  };
}

export async function savePermission(p) {
  const id = p.id || `p${Date.now().toString(36)}`;
  const clean = {
    id,
    assetType: p.assetType,
    channels: p.channels || [],
    startsOn: p.startsOn || today(),
    expiresOn: p.expiresOn || null,
    consentSource: p.consentSource || '',
    approvedText: p.approvedText || '',
    maxPerQuarter: p.maxPerQuarter ? Number(p.maxPerQuarter) : undefined,
    revoked: !!p.revoked,
    revokedOn: p.revoked ? p.revokedOn || today() : undefined,
    notes: p.notes || '',
  };
  await atl.updateLedgerRecord(p.customerId, (r) => ({ ...r, permissions: [...(r.permissions || []).filter((x) => x.id !== id), clean] }));
  return getLedgerView();
}

export async function deletePermission({ customerId, id }) {
  await atl.updateLedgerRecord(customerId, (r) => ({ ...r, permissions: (r.permissions || []).filter((x) => x.id !== id) }));
  return getLedgerView();
}

export async function setCustomerStatus({ customerId, status, runSweep = true }) {
  await atl.updateLedgerRecord(customerId, (r) => ({ ...r, status, churnedAt: status === 'churned' ? today() : null }));
  const sweepResult = status === 'churned' && runSweep ? await sweep({ reason: 'customer marked churned', onlyCustomerId: customerId }) : null;
  return { view: await getLedgerView(), sweep: sweepResult };
}

export async function updateCustomer({ customerId, aliases, segment, owner, renewalAtRisk, doNotContact }) {
  await atl.updateLedgerRecord(customerId, (r) => ({
    ...r,
    ...(aliases !== undefined ? { aliases: aliases.filter(Boolean) } : {}),
    ...(segment !== undefined ? { segment } : {}),
    ...(owner !== undefined ? { owner } : {}),
    ...(renewalAtRisk !== undefined ? { renewalAtRisk } : {}),
    ...(doNotContact !== undefined ? { doNotContact } : {}),
  }));
  return getLedgerView();
}

// Put a JSM organization into the ledger (an empty record), or create a new organization first.
export async function addCustomer({ orgId, name }) {
  let id = orgId ? String(orgId) : null;
  if (!id) {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Enter a customer name or choose an organization.');
    const ledger = await atl.loadLedger();
    const match = [...ledger.customers, ...ledger.untracked].find((o) => o.name.toLowerCase() === clean.toLowerCase());
    id = match ? match.id : String((await atl.createOrganization(clean)).id);
  }
  const raw = await atl.getRawLedgerRecord(id);
  if (!raw) await atl.putLedgerRecord(id, { aliases: [], status: 'active', segment: '', owner: '', permissions: [], uses: [] });
  return getLedgerView();
}

// Everything the global page shows on first open, with the ledger loaded once (not once per tab).
export async function getHome({ isAdmin }) {
  let ledger;
  try {
    ledger = await atl.loadLedger();
  } catch (e) {
    if (isNoServiceManagement(e)) return { needsJsm: true, message: e.message };
    throw e;
  }
  const [view, dash, demo] = await Promise.all([getLedgerView(ledger), getDashboard(ledger), getDemoSetup({ isAdmin, ledger })]);
  return { view, dashboard: dash, demo };
}

export const isNoServiceManagement = (e) => e?.code === 'NO_JSM';

// ---------- demo data (admins only) ----------

function siteAdapter() {
  const issue = (i) => ({ key: i.key, summary: i.fields?.summary, labels: i.fields?.labels || [] });
  return {
    listOrgs: () => atl.listOrganizations(),
    getRecord: (id) => atl.getRawLedgerRecord(id),
    putRecord: (id, r) => atl.putLedgerRecord(id, r),
    createOrg: (name) => atl.createOrganization(name),
    findSpace: (key) => atl.findSpace(key),
    findPage: (spaceId, title) => atl.findPageByTitle(spaceId, title),
    createPage: (spaceId, title, body) => atl.createPage(spaceId, title, body),
    updatePage: (id, title, body, version) => atl.updatePage(id, title, body, version),
    addLabels: (id, labels) => atl.addPageLabels(id, labels),
    searchIssues: async (jql) => (await atl.searchIssues(jql, 'summary,labels')).map(issue),
    createIssue: (project, summary, labels) => atl.createIssue(project, summary, labels),
    addIssueLabels: (key, labels) => atl.addIssueLabels(key, labels),
    getIssueProperty: (key, prop) => atl.getIssueProperty(key, prop),
    setIssueProperty: (key, prop, value) => atl.setIssueProperty(key, prop, value),
    closeIssue: (key) => atl.closeIssue(key),
    // The app may not be allowed to delete organizations; then just take the old one out of the ledger.
    deleteOrg: async (id) => {
      try {
        await atl.deleteOrganization(id);
      } catch (e) {
        console.warn(`could not delete old demo organization ${id} (${String(e.message).slice(0, 80)}); removing its ledger record instead`);
        await atl.deleteLedgerRecord(id);
      }
    },
    renameIssue: (key, summary) => atl.renameIssue(key, summary),
  };
}

export async function getDemoSetup({ isAdmin, ledger: preloaded = null }) {
  const settings = await getSettings();
  if (!isAdmin) return { isAdmin: false, settings };
  const [spaces, projects, ledger] = await Promise.all([
    atl.listSpaces().catch(() => []),
    atl.listProjects().catch(() => []),
    preloaded || atl.loadLedger(),
  ]);
  return {
    isAdmin: true,
    settings,
    spaces,
    projects: projects.filter((p) => p.type !== 'service_desk'),
    demoCustomers: ledger.customers.filter((c) => c.demo).length,
    demoTotal: DEMO_CUSTOMERS.length,
  };
}

export async function runDemo({ reset = false, taskProject, spaceKey } = {}) {
  const settings = await saveSettings({ ...(taskProject ? { taskProject } : {}), ...(spaceKey ? { demoSpaceKey: spaceKey } : {}) });
  const report = await applyDemo(siteAdapter(), { today: today(), taskProject: settings.taskProject, spaceKey: settings.demoSpaceKey, reset, log: (m) => console.log(`demo ${reset ? 'reset' : 'load'}: ${m}`) });
  if (reset) {
    // Cached scan and sweep results describe the old state; clear them so the dashboard starts fresh.
    await kvs.delete('lastScan');
    await kvs.delete('lastSweep');
  }
  return { ...report, message: summarizeDemoReport(report, reset) };
}
