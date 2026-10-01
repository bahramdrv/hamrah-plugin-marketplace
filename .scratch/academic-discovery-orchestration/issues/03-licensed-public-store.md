# Licensed public metadata store and record identity

Blocked by: 01
Status: done

Spec: [design](../spec.md); [details](../../../docs/academic-discovery-plan-fa.md).

- [x] Source policies enumerate permitted fields/license/attribution/TTL/delete/quota before retention expands.
- [x] Keep applicant input, personalized reports and contact lists outside the shared store; follow ADR 0008.
- [x] Scope new namespaces independently; preserve ADR 0006/0007 rules until explicitly revised.
- [x] Define record observation age, absolute expiry, canonical publisher/source identity and bounded refresh.
- [x] Prove safe reads/writes, outage behavior, expiry and concurrent refresh on the actual database before enabling.

Actual Redis concurrency, expiry and non-renewal acceptance passed in Preview build 29qY12cUtz3Xpj6sGLu2GiFPodgG. No applicant data was used.
