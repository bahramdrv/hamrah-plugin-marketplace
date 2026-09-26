# 22 — Iranian Route Viability Index

**What to build:** An applicant can request an Iranian Route Viability Index for one route with component reasons and confidence, while the existing Practical Fit and other measures retain their meanings.

Blocked by: 21 — Separate official approval statistics; 07 — Partial Route Fact Pack

Status: done

**Phase:** 7

- [ ] getIranianRouteViability computes a versioned deterministic 0–100 IRVI from official accessibility, profile compatibility, execution practicality, Iran-specific evidence, qualified examples, funding or sponsorship, evidence quality, and friction.
- [ ] The output keeps official eligibility, applicant fit, Practical Fit, Community Confidence, IRVI, and official approval statistics in distinct fields and never labels a score as approval probability.
- [ ] A current source-backed route without verified recent Iranian examples may display numeric IRVI with low confidence and an unranked reason.
- [ ] Tests exercise component arithmetic, contradiction and stale-data behavior, score separation, and the low-confidence example.

