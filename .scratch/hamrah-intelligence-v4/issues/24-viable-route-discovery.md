# 24 — Viable route discovery

**What to build:** An Iranian applicant can discover and compare rankable routes while seeing unranked candidates and their missing evidence separately.

Blocked by: 23 — Route Evidence Thresholds

Status: done

**Phase:** 8

- [ ] findViableRoutesForIranians combines legal candidates, official eligibility, applicant fit, Iran-specific constraints, public experiences, opportunities, friction, freshness, and Route Evidence Thresholds.
- [ ] Ranked results include reasons, risks, qualified example counts, source IDs, ideal next actions, confidence, and Persian summaries; unranked candidates explain the missing gate.
- [ ] An unavailable EvidenceProvider yields research_required rather than invented facts, and limits bound candidate count and fan-out.
- [ ] MCP tests cover rankable, official FAIL, stale, insufficient evidence, provider failure, and multi-country no-coverage cases.

