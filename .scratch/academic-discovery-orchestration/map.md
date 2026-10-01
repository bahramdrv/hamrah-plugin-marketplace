# Academic Discovery design tree

Status: complete

Source: [Persian design](../../docs/academic-discovery-plan-fa.md).

Resolved: current evidence with stable presentation (Q1); separate verified results and candidates (Q2); research fit first with separate funding (Q3); public shared records and local private reports (Q4, ADR 0008); incomplete input permits labelled exploratory output (Q5); web search remains required when needed.

Resolved: ROR/OpenAlex/Crossref + official/ATS/JSearch + Tavily/web (Q6); bounded existing Redis (Q7, ADR 0009); up to ten main results and separate candidates with continuation (Q8).

The design frontier is empty. The owner confirmed the full design and Tavily free-account terms. Implementation, Preview, actual Redis and exact-version Production acceptance passed. All tickets are done. Actual unavailable scopes and intermittent JSearch timeout/recovery are recorded in docs/academic-discovery-acceptance.md; public observations are in evidence/.

Implementation order: 01 → 02/03 → 04 → 05 → 06 → 07. Parallelizable ticket numbers describe dependencies, not permission to delegate implementation.
