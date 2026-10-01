# Preview and Production rollout with exact-version acceptance

Blocked by: 06, provider credentials and account prerequisites
Status: done

Spec: [design](../spec.md); [details](../../../docs/academic-discovery-plan-fa.md).

- [x] Configure selected provider secrets and flags in the existing Vercel project; reuse existing accounts.
- [x] Verify actual free plans, hard limits and shared database headroom without activating paid overage.
- [x] Run Preview actual-source acceptance and official-page checks; validate Redis concurrency and expiry separately.
- [x] Deploy the tested version to Production as authorized, without an unauthorized Git push.
- [x] Verify exact deployed revision, public tool contracts and actual search output; synthetic smoke is labelled synthetic.
- [x] Record rollback/disable-source steps, actual country/type coverage and any unresolved verification gaps.

Acceptance: Production implementation `0001365f456e8877093c1c1f55a50c8496a283d3`, 14 actual academic calls and all three existing live scripts passed. Tavily Researcher free plan has paid overage disabled; no card or billing address was entered. Redis concurrency/expiry/non-renewal passed in Preview. GB masters has unavailable job-API coverage; an exact US Physics PhD replay timed out once and the subsequent orchestration request succeeded with JSearch and Tavily. See docs/academic-discovery-acceptance.md and public JSON evidence; no push was performed.
