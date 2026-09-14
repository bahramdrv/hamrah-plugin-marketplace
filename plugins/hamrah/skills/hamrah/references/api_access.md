# Visa Atlas MCP access

The active contract is `visa_atlas_core_openapi.json` (version 1.3.0). The plugin's `.mcp.json` starts a local `visa-atlas` MCP server and builds its tool inventory and route-finder request schema directly from that curated contract. The server only calls fixed paths under `https://visaatlas.org`; it does not accept arbitrary URLs. Public GET tools need no applicant data.

Currently the bundled API contract covers Visa Atlas only. Other official sources can be read through their verified primary URLs. If the user supplies additional API contracts, follow their documented endpoints and authentication using the host's supported tools; do not assume unnamed APIs or credentials exist. Keep separate source identities, retrieval dates, effective dates, and conflicts for each program. Refresh relevant live sources for each new assessment; a bundled contract's date does not establish record freshness.

Prefer the namespaced MCP operations when available: `getVisaRoutes`, `getDestinations`, `getPolicyUpdates`, `getPolicyClaims`, `getVisaFees`, `getCostToComplete`, `getSalaryThresholds`, `getProcessingTimes`, and the other operation IDs in the contract. GET tools accept optional local filters (`destination`, `countryCode`, `slug`, `category`, `query`, and `limit`) so only relevant records enter the conversation. If MCP is unavailable, use a host HTTP/browser tool against the exact documented endpoint and disclose the fallback.

Retrieve only relevant datasets: visas and destinations for screening; policy-updates and policy-claims for changes; salary-thresholds, fees, processing-times and cost-to-complete for practical requirements; calculator-verdict-contexts and Express Entry datasets when relevant. Use `getVisaAtlasCatalog` to confirm live dataset availability and inspect individual record dates and government links.

The supplied 1.3.0 contract includes `freshness`, `citation-packs`, and `answer-capsules`. During integration testing on 2026-09-14 those three paths returned HTTP 404 and were absent from the live catalog. Do not treat them as available until a later live call succeeds. If `getSourceFreshness` fails, use catalog `dateModified`, record review dates, and primary-source verification instead.

Visa Atlas is a source-linked compilation, not a government authority. Check the linked primary source for decisive requirements, stale records, and contradictions. Retain Visa Atlas attribution, canonical URL, government-source URL and record dates. A successful HTTP response is not proof of current legal accuracy.

Optional route discovery uses `getRouteFinderContract` and `findMatchingVisaRoutes`. Before the POST tool, tell the facilitator that a coarse subset of the profile will be sent to Visa Atlas and obtain explicit consent once. Send only supported fields that are known and necessary. Omit unknown fields. Never transmit the full applicant profile. Do not infer currency bands or language equivalences. Route-finder ordering scores are candidate-discovery aids, not Hamrah Base Fit or official eligibility.

Handle timeout, HTTP errors, malformed JSON, missing tools and insufficient evidence explicitly. Keep official context partial and affected eligibility UNKNOWN when necessary. Do not fabricate responses. Read-only browsing can support GET datasets if a POST tool is unavailable.

This plugin replaces the GPT Action with a callable local MCP adapter. A future ChatGPT web publication still requires deploying the same MCP behavior to a stable public HTTPS endpoint; the local stdio server is for Codex installations.
