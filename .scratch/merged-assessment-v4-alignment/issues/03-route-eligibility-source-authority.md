# 03: Route eligibility needs versioned Source Authority for decisive results

**What to build:** A facilitator using the eligibility tool gets an official PASS or FAIL only when each decisive check links a real HTTPS source whose versioned Source Authority covers that exact claim. A title alone, a missing URL, or an unrecognised source yields a Provisional Assessment that cannot be ranked. Source: Spec review finding 1 (a check with only `sourceTitle: "Some blog"` currently returns PASS and `usableForRanking: true`); spec ticket 03; ADR 0003.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The tool classifies each decisive check with the same versioned source authority policy the scorecard validator uses; there is one policy file, not a second copy.
- [x] A title-only, URL-less, non-HTTPS, or unrecognised source cannot produce PASS or FAIL; the result is marked provisional and `usableForRanking` is false.
- [x] A time-sensitive check past its versioned freshness limit cannot produce PASS, using the same freshness policy as the scorecard validator.
- [x] Each reason in the output keeps the source URL, authority classification, rule ID, policy version and check date.
- [x] Tests cover primary authority, unknown authority, title-only source, and a source whose scope does not match the claim; the live MCP acceptance check still passes.
