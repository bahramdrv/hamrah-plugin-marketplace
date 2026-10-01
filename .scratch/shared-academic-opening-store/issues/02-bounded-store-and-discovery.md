# Implement bounded public opening storage

Blocked by: 01

Status: blocked

See [design](../../../../docs/shared-academic-opening-store.md).

- [ ] Start with failing executeTool tests for repeat hit, distributed refresh, new posting, expiration, dedup, quota, source/schema failure and no private persistence.
- [ ] Inject clock/store/provider; keep strict allowlist and bounded records/bytes/TTL/index deletion.
- [ ] Apply independent atomic provider quotas before every list/detail/retry.
- [ ] Report actual cached age, skipped fresh API, failures and scope; never mark cached data verified.
- [ ] Update tool annotations and host skill; retain official verification per request and fresh web search.
- [ ] Run all four AGENTS.md checks before commit.

Preparation 2026-10-01: a disabled-by-default JobTech source slice and opt-in Redis adapter are implemented locally. Public seam tests cover repeat hits, newly posted leads after refresh, source failures, quota/busy, invalid/expired metadata and no private persistence. Tool annotation and host reference updated. Production activation remains blocked by 01 and real Redis acceptance; other sources retain stateless behavior. See proposed ADR 0007.
