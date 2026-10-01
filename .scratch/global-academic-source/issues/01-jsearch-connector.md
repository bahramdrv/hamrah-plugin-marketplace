# Connect bounded JSearch discovery

Blocked by: None

Status: in-progress

- [x] Verify actual Basic/Free plan hard cap in browser and put existing key in protected Vercel environment without exposing it.
- [x] Test-first through executeTool: country-scoped public query, strict minimal unverified fields, configured-only activation, bounded worldwide sample, quota/errors, no private input, no persistence.
- [x] Follow the official /search-v2 schema with fields projection and one page (one credit) per query; do not default a global query silently to US.
- [x] Record host verification requirements, limitations and setup guidance.
- [ ] Run all required checks, live local country comparisons, deploy when authorized, and verify the exact deployed commit/live output.

Pre-deployment checks: npm test 347 passed, verify:release and check:static passed; all four Python suites 47 passed. Browser confirmed actual Basic $0/mo and 200/month hard limit; key stored as Secret and both flags as Config in Production. Provider Playground did not render parameter fields, so live acceptance will use the deployed MCP tool. No temporary credential file was written.
