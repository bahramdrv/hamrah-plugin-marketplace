# 02: Community friction uses inspected privacy and reports honest coverage

**What to build:** A facilitator asking for the community adjustment of a route gets friction from every validated signal in scope, whatever the dataset version, and a coverage statement that matches what was actually used. Today every German Opportunity Card signal (11, and 20 store-wide) is ignored because the tool looks for a version 2 privacy flag, yet coverage is reported as `strong`. Source: Spec review finding 3; ADR 0004.

**Blocked by:** 01 — Legacy datasets keep only what their sources said (penalties depend on evidence maturity, which 01 stops fabricating)

**Status:** ready-for-agent

- [ ] The privacy gate relies on the store's inspected privacy status for version 2, 3 and 4 datasets, not on redaction metadata.
- [ ] Coverage reports how many matching signals were used and how many were excluded, with reasons; when every matching signal is excluded, coverage cannot be `strong`.
- [ ] The dataset scan limit option is honoured and truncation is reported.
- [ ] Per ADR 0004, the result is labelled as a Practical Fit component only and never feeds the Iranian Route Viability Index, Route Evidence Thresholds, Rankable Route status, or route discovery ordering.
- [ ] A seed test against the deployed store shows the German Opportunity Card signals being evaluated (applied or ignored for a policy reason, not a privacy-flag reason).
- [ ] The live MCP acceptance check still passes against its expectations, updated if the output shape changed.
