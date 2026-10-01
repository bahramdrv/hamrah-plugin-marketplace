# Preview and Production rollout with exact-version acceptance

Blocked by: 06, provider credentials and account prerequisites
Status: in-progress

Spec: [design](../spec.md); [details](../../../docs/academic-discovery-plan-fa.md).

- [ ] Configure selected provider secrets and flags in the existing Vercel project; reuse existing accounts.
- [ ] Verify actual free plans, hard limits and shared database headroom without activating paid overage.
- [ ] Run Preview actual-source acceptance and official-page checks; validate Redis concurrency and expiry separately.
- [ ] Deploy the tested version to Production as authorized, without an unauthorized Git push.
- [ ] Verify exact deployed revision, public tool contracts and actual search output; synthetic smoke is labelled synthetic.
- [ ] Record rollback/disable-source steps, actual country/type coverage and any unresolved verification gaps.
