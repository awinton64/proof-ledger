# Proof Ledger privacy policy

Effective November 18, 2026.

Proof Ledger is a Forge app that runs on Atlassian's platform inside your Atlassian site. This policy explains what it handles.

## What the app reads and stores

- **Customer consent records**: the customer organization names you already keep in Jira Service Management, plus the permissions you enter (asset type, channels, dates, consent source, approved wording, reference-call history). Stored as a property on each Jira Service Management organization in your site.
- **Proof requests**: the customer, use, channel, wording and purpose entered in the Jira issue panel. Stored as a property on that Jira issue.
- **Confluence scan results**: a summary (status and number of findings) of each scanned page. Stored as a property on that page. To scan, the app reads page text and labels in your site.
- **Settings and the last scan and sweep results**: stored in the app's Forge storage for your site.
- **Fix tasks**: Jira issues created in your site by the sweep.

## Where data goes

Nowhere outside your Atlassian site. The app makes no calls to outside servers, uses no analytics, no tracking and no third-party services, and does not call AI or LLM APIs. When you use the optional Rovo agent or MCP tools, Atlassian's Rovo processes your conversation under Atlassian's own terms; the app only returns rule-check results to it.

Atlassian hosts the app's code and storage as part of Forge. See Atlassian's privacy policy at https://www.atlassian.com/legal/privacy-policy.

## Retention and deletion

Data stays until you delete it. Delete a permission or customer record in the app, delete the issue or page, or uninstall the app (Forge storage for the app is removed by Atlassian after uninstall; properties on your issues, pages and organizations remain until you delete them).

## Personal data

The app is designed for company-level records (customer organizations). Do not enter sensitive personal data. Consent source fields hold a ticket key or link, not documents.

## Contact

Questions or requests: open an issue on the project's public repository.
