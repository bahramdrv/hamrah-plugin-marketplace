# Academic Discovery orchestration

Status: approved-for-implementation

The accepted product decisions and evidence are in [the design](../../docs/academic-discovery-plan-fa.md). Use CONTEXT.md and ADRs 0006–0008. Do not infer a global admissions catalog from a research graph or infer a scholarship from an awarded grant.

Implement a request-scoped API + official-web workflow with one versioned report envelope, per-type evidence rules, explicit partial coverage, deterministic replay, private export and bounded licensed public storage. Web search is part of discovery and verification even when API discovery succeeds. Preserve current public tools through compatible delegation where possible.

Source stack: ROR/OpenAlex/Crossref + existing official/ATS/JSearch + Tavily and web search. Store: bounded existing Redis, with source-specific expiry and retention. Initial depth: up to ten main verified results plus separate relevant candidates; further checking continues the same search. The owner confirmed shared understanding of the completed plan; do not describe an untested deployment as released behavior. The existing live JSearch connection reports a source failure and requires diagnosis before acceptance.
