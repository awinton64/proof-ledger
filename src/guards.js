// Small pure helpers for access checks and install context. No Forge imports, so they are unit tested.

// Which product an installation belongs to, from the installContext ARI in the invocation context
// (for example ari:cloud:jira::site/<cloudId>). Null when unknown.
export function installProduct(context) {
  const ctx = String(context?.installContext || context?.installation?.installContext || '');
  const m = /^ari:cloud:(jira|confluence)(?:-[a-z]+)?::site\//.exec(ctx);
  return m ? m[1] : null;
}

// The daily sweep runs only in the Jira installation, which holds the settings. Unknown context: run.
export const shouldRunDailySweep = (context) => {
  const p = installProduct(context);
  return !p || p === 'jira';
};

export const NO_JSM_MESSAGE = 'Proof Ledger needs Jira Service Management on this site: customers and their consent are stored on Jira Service Management organizations. Add Jira Service Management (the Free plan works), then reload.';

// A site without Jira Service Management answers 404 on the organization API.
export function noJsmError(e) {
  if (!/^Jira 404/.test(String(e?.message || ''))) return e;
  const err = new Error(NO_JSM_MESSAGE);
  err.code = 'NO_JSM';
  return err;
}

export const DENIED = 'You do not have permission to view this page, or it does not exist.';

// Scan a page for a Rovo action or MCP tool, but only after the invoking user is confirmed to be able
// to view it. `canView(pageId)` must check as the user; `scan(pageId)` reads as the app.
export async function scanPageForUser(rawPageId, { canView, scan }) {
  const pageId = String(rawPageId ?? '').trim();
  if (!/^\d+$/.test(pageId)) return { error: 'pageId must be a numeric Confluence page ID.' };
  let allowed = false;
  try {
    allowed = await canView(pageId);
  } catch {
    allowed = false;
  }
  if (!allowed) return { error: DENIED, denied: true };
  const r = await scan(pageId);
  return { page: r.title, url: r.url, channel: r.channel, status: r.status, summary: r.summary, findings: r.findings };
}
