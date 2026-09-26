# 09: Community friction can use version 2 and version 4 evidence

**What to build:** A facilitator asking for the community adjustment of a route gets penalties from any validated, corroborated friction signal, not only from native version 3 signals. Today version 2 and version 4 datasets never record evidence maturity, so their signals are always excluded and the adjustment is effectively zero. Define a versioned, deterministic rule that derives maturity from what these versions do record (for version 4, the existing Evidence Confidence of Route Claims and signal evidence; for version 2, its independent report and verification fields), without inventing corroboration. Source: ticket 02 report; ADR 0004.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] A documented, versioned rule maps version 2 and version 4 evidence fields to evidence maturity; fields that are absent keep maturity unknown, never corroborated.
- [x] The rule reuses the existing Evidence Confidence and independence counts rather than a new heuristic.
- [x] Community adjustment applies penalties from qualifying version 2 and version 4 signals and still excludes those whose maturity is unknown, with reasons.
- [x] Per ADR 0004 the result remains a Practical Fit component only.
- [x] Tests cover a qualifying version 4 signal, a version 4 signal with too little independent evidence, and a version 2 signal, through the community adjustment tool.
