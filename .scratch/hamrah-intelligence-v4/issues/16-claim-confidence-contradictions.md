# 16 — Claim validation and Evidence Confidence

**What to build:** A facilitator can validate a Route Claim and see deterministic Evidence Confidence, independence counts, contradictions, and a scope-limited explanation.

Blocked by: 15 — Route Claim retrieval

Status: done

**Phase:** 4

- [ ] validateRouteClaim computes a versioned 0–100 Evidence Confidence from diversity, independent reports, primary support, recency, scope, data quality, and contradiction penalty.
- [ ] One anecdote remains weak; copied reports count once; independent corroboration can raise confidence; opposing evidence lowers it without being discarded.
- [ ] Possible explanations for contradictions are labeled as hypotheses, and private evidence may add context but not a public ranking vote.
- [ ] MCP tests cover single, copied, corroborated, stale, and contradicted cases with explainable component outputs.

