# 07: Visa Atlas is trusted, and decisive requirements are confirmed at the primary source

**What to build:** A facilitator assessing a route gets requirements from Visa Atlas first and sees them as trusted evidence. A route backed only by current Visa Atlas records reaches at most POSSIBLE, labelled as awaiting official confirmation. Once each decisive requirement is also confirmed on a primary official page, the route can receive an official PASS or FAIL. Primary pages are recognised by versioned host and path rules per country and claim type, not by exact requirement wording. Today the Source Authority policy has one exact-wording rule, so almost every real assessment is provisional. Source: ADR 0005; ADR 0003; `eligibility_rules.md` ("official source or configured trusted route dataset").

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The versioned Source Authority policy supports host and path-prefix rules scoped by country and claim type, alongside the existing exact rules; one policy file serves both the MCP tool and the Python scorecard validator.
- [x] The policy classifies Visa Atlas record URLs as `trusted` only when the requirement carries the record's government source link and a verification date within the freshness policy; otherwise they are unknown.
- [x] The policy is seeded with primary rules for the official German sources already used in the published evidence (Residence Act on gesetze-im-internet.de, the federal Make it in Germany portal, German missions on diplo.de including the consular services portal), each with a basis and review date.
- [x] A decisive requirement with only trusted authority cannot produce PASS or FAIL: the route is at most POSSIBLE with a label saying official confirmation is pending; with primary confirmation it can be PASS or FAIL; a primary source that contradicts Visa Atlas decides the result.
- [x] Unknown sources, title-only sources, and stale or unlinked Visa Atlas records keep the assessment provisional and unrankable, as now.
- [x] The Python scorecard validator enforces the same rules; its tests and the MCP tool tests cover trusted-only, trusted plus primary, contradiction, and unknown.
- [x] Skills and API docs describe the two-step flow (Visa Atlas first, primary confirmation for decisive requirements); the live MCP acceptance check still passes.
