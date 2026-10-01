# Connect bounded JSearch discovery

Blocked by: None

Status: done

- [x] Verify actual Basic/Free plan hard cap in browser and put existing key in protected Vercel environment without exposing it.
- [x] Test-first through executeTool: country-scoped public query, strict minimal unverified fields, configured-only activation, bounded worldwide sample, quota/errors, no private input, no persistence.
- [x] Follow the official /search-v2 schema with fields projection and one page (one credit) per query; do not default a global query silently to US.
- [x] Record host verification requirements, limitations and setup guidance.
- [x] Run all required checks, live local country comparisons, deploy when authorized, and verify the exact deployed commit/live output.

Pre-deployment checks: npm test 347 passed, verify:release and check:static passed; all four Python suites 47 passed. Browser confirmed actual Basic $0/mo and 200/month hard limit; key stored as Secret and both flags as Config in Production. Provider Playground did not render parameter fields, so live acceptance will use the deployed MCP tool. No temporary credential file was written.

Live acceptance completed on 2026-10-01 against deployed commit 130a2fd4f5fec2453c8acffda0e2035e62d3080d. Six country-scoped physics/postdoc requests covered GB/FR/DE/CA/AU (DE retried manually after a failed request). GB returned four unverified leads and CA one; FR/DE/AU returned no matching filtered leads. This is a bounded query sample, not university coverage. Oxford transient astrophysics lead matched the official department vacancy list with a future 6 November deadline; the Liverpool ALICE lead was expired in the official source and must be excluded from an open shortlist. Toronto delegation and other leads remain unverified. Live health and verify-live-opportunities passed for the exact deployed commit.
