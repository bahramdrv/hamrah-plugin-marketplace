# Visa Atlas REST access

The supplied contract is `visa_atlas_openapi.json`. Resolve operation IDs, methods, paths and request schemas from that file. The base URL is `https://visaatlas.org`. Public GET requests need no applicant data.

Currently the bundled API contract covers Visa Atlas only. Other official sources can be read through their verified primary URLs. If the user supplies additional API contracts, follow their documented endpoints and authentication using the host's supported tools; do not assume unnamed APIs or credentials exist. Keep separate source identities, retrieval dates, effective dates, and conflicts for each program. Refresh relevant live sources for each new assessment; a bundled contract's date does not establish record freshness.

Use available HTTP or browser tools to fetch the exact documented endpoints. In a shell, for example:

```sh
curl --fail --silent --show-error --location --max-time 30 https://visaatlas.org/api/public/visas
```

Retrieve only relevant datasets: visas and destinations for screening; policy-updates and policy-claims for changes; salary-thresholds, fees, processing-times and cost-to-complete for practical requirements; calculator-verdict-contexts and Express Entry datasets when relevant. Use the catalog and live OpenAPI document to discover additions, including freshness data; the supplied contract has no dedicated source-freshness endpoint. Inspect individual record dates and government links.

Visa Atlas is a source-linked compilation, not a government authority. Check the linked primary source for decisive requirements, stale records, and contradictions. Retain Visa Atlas attribution, canonical URL, government-source URL and record dates. A successful HTTP response is not proof of current legal accuracy.

Optional route discovery uses GET `/api/public/route-finder` for its contract and POST on the same path with `RouteFinderRequest`. Use a tool capable of JSON POST; send only supported fields that are known and necessary. Omit unknown fields. Never transmit the full applicant profile. Do not infer currency bands or language equivalences. Route-finder ordering scores are candidate-discovery aids, not Hamrah Base Fit or official eligibility.

Handle timeout, HTTP errors, malformed JSON, missing tools and insufficient evidence explicitly. Keep official context partial and affected eligibility UNKNOWN when necessary. Do not fabricate responses. Read-only browsing can support GET datasets if a POST tool is unavailable.

This package preserves the GPT Action contract and provides REST invocation instructions. It does not install a hosted Action or an MCP server, and requires a host with browsing/HTTP access for live screening.
