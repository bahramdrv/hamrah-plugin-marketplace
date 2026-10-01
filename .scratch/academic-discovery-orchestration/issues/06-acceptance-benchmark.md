# Evidence accuracy and workflow acceptance

Blocked by: 05
Status: done

Spec: [design](../spec.md); [details](../../../docs/academic-discovery-plan-fa.md).

- [x] Pre-register public benchmark cases across universities, programs, supervisors, vacancies and funding calls.
- [x] Include known positives, exclusions and genuine unknowns; measure verified-claim precision and coverage separately.
- [x] Test multilingual equivalence, provider reordering, source changes, incomplete profiles, failures and privacy boundaries.
- [x] Measure full-request p50/p95 and API/database consumption; do not invent accuracy or latency guarantees.
- [x] Run repository JS, release, static and all four Python checks; record precise command/runtime/result.

Acceptance: 361 JS tests, 47 Python tests, release/static checks passed. Fourteen-call real Preview sample passed; p50/p95 include CLI overhead and are not service guarantees. One actual program is verified; no global claim-precision rate is inferred. See docs/academic-discovery-acceptance.md for the blocked Oxford source and supported MIT case.
