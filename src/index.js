import Resolver from '@forge/resolver';
import * as svc from './service';

const resolver = new Resolver();
const wrap = (fn) => async (req) => {
  try {
    return { ok: true, data: await fn(req) };
  } catch (e) {
    console.error(e);
    return { ok: false, error: String(e.message || e) };
  }
};

// Global page
resolver.define('ledger', wrap(() => svc.getLedgerView()));
resolver.define('dashboard', wrap(() => svc.getDashboard()));
resolver.define('savePermission', wrap(({ payload }) => svc.savePermission(payload)));
resolver.define('deletePermission', wrap(({ payload }) => svc.deletePermission(payload)));
resolver.define('setCustomerStatus', wrap(({ payload }) => svc.setCustomerStatus(payload)));
resolver.define('updateCustomer', wrap(({ payload }) => svc.updateCustomer(payload)));
resolver.define('scanAll', wrap(() => svc.scanAll()));
resolver.define('sweep', wrap(() => svc.sweep({ reason: 'manual' })));
resolver.define('saveSettings', wrap(({ payload }) => svc.saveSettings(payload)));
resolver.define('check', wrap(({ payload }) => svc.checkProof(payload)));

// Jira issue panel
resolver.define('getRequest', wrap(({ context }) => svc.getRequest(context.extension.issue.key)));
resolver.define('saveRequest', wrap(({ context, payload }) => svc.saveRequest(context.extension.issue.key, payload)));
resolver.define('logUse', wrap(({ context }) => svc.logUse(context.extension.issue.key)));

// Confluence byline
resolver.define('scanPage', wrap(({ context }) => svc.scanById(String(context.extension.content.id))));

export const handler = resolver.getDefinitions();

// Confluence page published or updated: re-check it and store the result as a content property.
export async function onPageEvent(event) {
  const id = event?.content?.id;
  if (!id) return;
  try {
    const r = await svc.scanById(String(id));
    console.log(`scan on ${event.eventType} page ${id}: ${r.status} ${r.summary}`);
  } catch (e) {
    console.error(`page event scan failed for ${id}: ${e.message}`);
  }
}

// Daily expiry and churn sweep (Jira installation).
export async function dailySweep() {
  try {
    const r = await svc.sweep({ reason: 'daily schedule' });
    console.log(`daily sweep: ${r.created.length} task(s) created, ${r.existing.length} already open`);
  } catch (e) {
    console.error(`daily sweep failed: ${e.message}`);
  }
}

// Rovo actions and MCP tools. Same deterministic engine as the UI.
export async function checkProofAction(payload) {
  return svc.checkProof({ customer: payload.customer, assetType: payload.assetType, channel: payload.channel, quoteText: payload.quoteText });
}

export async function listReferenceableAction(payload) {
  return svc.listReferenceable({ assetType: payload.assetType, channel: payload.channel, segment: payload.segment });
}

export async function scanPageAction(payload) {
  const r = await svc.scanById(String(payload.pageId), { persist: false });
  return { page: r.title, url: r.url, channel: r.channel, status: r.status, summary: r.summary, findings: r.findings };
}
