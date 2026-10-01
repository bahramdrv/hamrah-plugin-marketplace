# Validate live cache and official-page behavior

Blocked by: 01, 02

Status: blocked

See [design](../../../../docs/shared-academic-opening-store.md).

- [ ] Replay repeated public-only requests against exact deployed SHA; check hit and bounded refresh.
- [ ] Verify each displayed opening on its current exact official page.
- [ ] Record provider request/command/byte consumption and prove no paid plan or automatic overage.
- [ ] Measure discovery and full response p50/p95, stale rate, fresh candidates and API-call reduction; do not claim latency improvement before measurement.
- [ ] Record truthful publisher/country/category coverage and incomplete-search states.
