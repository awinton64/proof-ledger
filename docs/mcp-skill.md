# Skill: check customer proof before naming a customer

Use this with any AI agent that has the Proof Ledger tools: a Rovo Studio agent with the three Proof Ledger tools added (tested), or an AI writing tool connected to the Atlassian MCP server where Proof Ledger is installed (exposed through `rovo:mcp`; not yet tested from an outside client).

Before you write copy that names a customer, quotes a customer, uses a customer's logo, cites a customer outcome, or suggests a customer for a reference call:

1. Call `check-proof` with `customer`, `assetType` (logo, quote, case_study, reference_call, outcome_claim), `channel` (website, paid_ads, social, sales_deck, case_study, press, events, partner, sales_call) and, for quotes and claims, the exact `quoteText`.
2. If the verdict is `ALLOWED`, you may use it. For quotes, use the `approvedText` exactly; do not paraphrase.
3. If the verdict is `NEEDS_CONSENT` or `BLOCKED`, do not name the customer. Say why, using the returned reasons, and suggest a proof request.
4. To find customers you can name, call `list-referenceable` with the asset type, channel and an optional segment.
5. To check a Confluence draft, call `scan-page` with its page ID and fix every finding before publishing.

Never invent a customer, quote, statistic or endorsement.
