# 26 — CI documentation and release verification

**What to build:** A maintainer can validate and explain the complete Hamrah intelligence release before deployment, and applicants can read what each score and evidence class does and does not measure.

Blocked by: 24 — Viable route discovery; 25 — Ideal Candidate Profile

Status: done

**Phase:** 9

- [ ] CI installs locked dependencies, runs Node and Python tests, validates all schemas and published datasets, enforces privacy gates, and runs practical static/security checks.
- [ ] A published dataset with privacy fail or needs_review makes CI fail; all nine phase outcomes and compatibility behavior are exercised by the full suite.
- [ ] Documentation explains official eligibility, applicant fit, Practical Fit, Community Confidence, Iranian Lived Experience, IRVI, and official approval statistics, including limits and the absence of an MCP consent gate.
- [ ] A Persian example output separates the measures, cites evidence and dates, and states that IRVI is not visa approval probability; final test results and known limitations are recorded.

