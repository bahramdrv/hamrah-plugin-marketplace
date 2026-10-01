# ADR 0007: bounded public academic opening cache

Status: proposed; production cache disabled pending live acceptance.
Date: 2026-10-01

## Context

Repeated applicant requests should reuse licensed public source metadata without persisting applicant facts or a query history. An API lead does not establish a currently open institutional opportunity. The existing supervisor candidate cache in ADR 0006 has a different purpose and namespace.

## Proposed decision

Start with only CC0 current Platsbanken postdoc postings via the free public JobTech API. Use one fixed source query, `postdoc`, limited to 100 postings. Match the user's field locally against public titles. Store strict minimal metadata, exact government posting URL, publisher organization identifier, deadline, observation time and `unverified` status. Never store descriptions, contact lists or caller facts.

The cache is opt-in through `HAMRAH_ACADEMIC_OPENING_CACHE_ENABLED=true`; absent configuration means live API discovery without persistence. An enabled cache with missing credentials or a failed quota guard fails closed for this source. Use a separate Redis namespace, a 100000-byte response/snapshot limit, seven-day absolute snapshot expiry, ten-minute reuse window and thirty-second refresh lease. Successful refresh replaces the snapshot; reads and failed refreshes never renew its expiry. Stale metadata remains only a visibly unverified hint.

One atomic Redis script reserves source calls (100/day, 10/minute) and conservative cache operation budgets (1000/day, 20000/month), with a distributed lease before refresh. A 429 establishes a bounded cooldown. These are internal ceilings, not claims about vendor limits. Quota-denial checks themselves consume Redis commands, so these counters are not an absolute vendor billing cap. Existing rate limiter and supervisor use share the actual Free account quota. The actual provider Free limit and refusal behavior must remain the financial boundary; no paid plan activation is authorized.

Every applicant request still needs fresh bounded web search and current verification of the exact institutional posting before presenting a Verified Open Academic Opportunity. Reuse can miss an API posting published in the last ten minutes, and titles/language and the 100-posting cap make this source partial. Report source scope, cache age, skipped refresh, failure and truncation. Do not extend persistence to the other seven API families without source-specific retention evidence.

## Acceptance pending

The public seam tests cover cache reuse, refreshed additions, stale/error/quota handling, strict records and opt-in persistence. Redis REST Lua execution, concurrent workers, expiry and actual account headroom still require live acceptance before enabling production persistence. The verified account is Free; Auto-upgrade was not exposed by the UI and must not be reported as disabled. NAV requires immediate change propagation and is excluded from this generic policy.
