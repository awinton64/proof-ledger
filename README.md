# Proof Ledger

Know which customers you may name, where, and until when.

Proof Ledger is a Forge app for Jira, Jira Service Management and Confluence. It keeps a record of what each customer agreed to (logo, named quote, case study, reference calls, outcome claims), in which channels, and for how long. Then it checks the places where customers get named: proof requests in Jira, and marketing pages in Confluence.

## The problem

B2B marketing and sales teams name customers all the time: logo walls, quotes in ads, case studies, "talk to one of our customers" reference calls. Each use needs the customer's permission, and that permission usually has limits: website logo yes, paid ads no; quote approved for twelve months; at most two reference calls a quarter. The permission usually lives in an email thread. So:

- a churned customer's logo stays on the homepage;
- a quote approved for a case study ends up in a paid ad, or gets reworded;
- the same happy customer gets asked for reference calls again and again;
- a sales rep names a customer who never agreed.

## What it does

| Where | What you get |
|---|---|
| Jira Service Management | Consent is stored on each **customer organization** (an organization property), so the customer list is the one your support team already keeps. |
| Jira global page | **Dashboard**: pages scanned and flagged, unconsented or wrong-channel uses, churn fallout, permissions expiring in 30 days, over-asked reference customers. **Customers and permissions**: add a JSM organization to the ledger (only organizations you add are tracked), record, edit, revoke; mark a customer churned. **Quick check**. **Demo data** (Jira admins): load or reset the fictional demo in one click. |
| Jira issue panel "Proof request" | Pick customer, use and channel (and the exact wording for quotes). Get **Allowed**, **Needs consent** or **Blocked**, with the reasons. Log reference calls against a 90-day limit. |
| Confluence byline "Proof check" | Scans the page for customer names, aliases and quoted text, using the page's `channel-*` label (for example `channel-paid-ads`). Flags each unconsented, expired, revoked, churned or wrong-channel use, with a fix. Pages are re-checked automatically when created or updated. |
| Churn and expiry sweep | When a customer is marked churned (or daily, for expired and revoked permissions), finds every Confluence page that still names them and raises one Jira fix task per page, without duplicates. |
| Rovo agent "Proof Desk" | Answers "Can we use this customer's quote in a paid ad?" and "Which healthcare customers can sales use for a reference call?" by calling the same rule engine. |
| Rovo tools and MCP exposure | The same three actions (`check-proof`, `list-referenceable`, `scan-page`) can be added as tools to any custom agent in Rovo Studio (tested). They are also exposed through the Atlassian MCP server with a `rovo:mcp` module, for outside AI writing tools; a call from an outside MCP client has not been tested yet, because the test organization limits the Atlassian MCP server to trusted domains. |

The verdicts come from rules, not AI. The core app needs no Rovo and makes no LLM calls. Rovo adds a conversational way in, built on the same deterministic engine.

## Rules

A use is checked against the customer's permissions for that asset type:

1. Customer marked churned: **Blocked**.
2. Permission revoked: **Blocked**. Reference calls over the 90-day limit: **Blocked** (with the date the next slot opens).
3. No permission, expired, not yet started, wrong channel, or quote wording that differs from the approved text: **Needs consent**.
4. Otherwise **Allowed**, with warnings when the permission expires within 30 days or the account is flagged as a renewal risk.

Text matching is exact and normalized (case, punctuation, curly quotes, accents). A quote near a customer's name is treated as theirs; a quote containing a number or percentage is treated as an outcome claim.

## Try it

Labels the scanner reads on Confluence pages: `channel-website`, `channel-paid-ads`, `channel-social`, `channel-sales-deck`, `channel-case-study`, `channel-press`, `channel-events`, `channel-partner`; optional `asset-case-study`. Pages without a channel label are treated as internal and only reported.

### Demo data

To try the app with fictional data, open **Apps > Proof Ledger > Demo data** as a Jira administrator, choose a Jira project (for proof requests and fix tasks) and a Confluence space (for the demo pages), and click **Load demo data**. It creates 12 invented customers of the invented vendor Corvane Analytics (as JSM organizations), 20 permissions, 8 labeled Confluence pages and 6 proof requests. It takes about a minute.

- Safe to run again: it only creates what is missing and keeps changes you made to demo records.
- **Reset demo data** restores the demo records and pages and closes fix tasks raised for demo customers.
- It never changes non-demo data. Demo records are marked (`demo: true` on the ledger record, label `proof-ledger-demo` on pages and issues); a customer, page or issue with a demo name but real data is skipped and reported.
- To remove the demo later, delete the demo organizations in JSM, the demo pages and the demo issues.

The same loader runs from the command line, for scripted setups (it also creates one synthetic JSM consent request per permission when a service project with key `CUST` exists):

```
SITE=https://your-site.atlassian.net ATL_EMAIL=you@example.com ATL_TOKEN=<api token> node scripts/seed.mjs [--reset]
```

Optional: `JSM_PROJECT`, `TASK_PROJECT` (default `PROOF`), `SPACE_KEY` (default `MKT`).

Demo script: open the Q1 paid social ad copy page and click **Proof check**; open a proof request in Jira; then mark Orrinvale Credit Union churned on the Proof Ledger page and watch three fix tasks appear, one for each page that still names it.

## Develop

```
npm install
npm test                 # engine and demo-data tests (node:test)
forge deploy && forge install
```

Requires Node 24 and Forge CLI 15. Source: `src/engine.js` (pure rules, tested), `src/service.js` (business logic), `src/atlassian.js` (REST access), `src/index.js` (resolvers, triggers, Rovo actions), `src/demo.js` (fictional demo data and the load/reset rules, shared with `scripts/seed.mjs`), `src/frontend/` (UI Kit).

## Data and privacy

All data stays in your Atlassian site: consent records live on JSM organizations, proof requests on Jira issue properties, scan results on Confluence page properties, and settings in Forge storage. The app sends nothing to any outside service. See [PRIVACY.md](PRIVACY.md) and [TERMS.md](TERMS.md).

## Built with

Forge (UI Kit, resolvers, async events, scheduled and product triggers, entity properties), Jira, Jira Service Management, Confluence, Rovo agents and actions, `rovo:mcp`. Built for Codegeist 2026 by Andrew Winton with AI coding assistance.

## License

MIT
