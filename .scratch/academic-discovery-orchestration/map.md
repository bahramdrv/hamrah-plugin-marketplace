# Academic Discovery design tree

Status: complete

Source: [Persian design](../../docs/academic-discovery-plan-fa.md).

Resolved: current evidence with stable presentation (Q1); separate verified results and candidates (Q2); research fit first with separate funding (Q3); public shared records and local private reports (Q4, ADR 0008); incomplete input permits labelled exploratory output (Q5); web search remains required when needed.

Resolved: ROR/OpenAlex/Crossref + official/ATS/JSearch + Tavily/web (Q6); bounded existing Redis (Q7, ADR 0009); up to ten main results and separate candidates with continuation (Q8).

The design frontier is empty. The owner confirmed the full design and Tavily free-account terms. Tickets 01–07 passed implementation, Preview, actual Redis and exact-version Production acceptance. Ticket 08 also passed: explicit push authorization, GitHub publication, both CI workflows, exact-version Vercel resource checks and installed/enabled plugin 0.1.4 verification. All tickets are done. Actual unavailable scopes and intermittent JSearch timeout/recovery are recorded in docs/academic-discovery-acceptance.md; public observations are in evidence/.

Implementation order: 01 → 02/03 → 04 → 05 → 06 → 07. Parallelizable ticket numbers describe dependencies, not permission to delegate implementation.

Post-release product acceptance: [09 — ROR HTTP homepage compatibility](issues/09-ror-http-homepage.md) is done. The connected installed MCP flow found and verified a real current MP-AIX call, exported a Persian sample, preserved stable equivalent-input results and rejected unsupported dates/funding. The concrete ROR compatibility correction was published and passed CI/Production checks; no new provider, paid plan, applicant storage or skill version was introduced.
