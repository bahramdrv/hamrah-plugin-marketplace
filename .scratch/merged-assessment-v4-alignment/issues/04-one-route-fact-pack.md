# 04: One Route Fact Pack meaning, concurrent and deadline-bounded

**What to build:** A facilitator calling the Route Fact Pack tool with either input form gets the same kind of result: datasets fetched concurrently under one deadline, per-dataset `success`, `failure` or `timeout` outcomes, a stated coverage denominator, and partial data when the deadline hits. The pack is never labelled complete. Source: Spec review finding 2 and scope-creep note; Standards finding 1 and the duplicated-builder smell; `CONTEXT.md` (Route Fact Pack, _Avoid_: Complete route assessment).

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The slug input form is an adapter onto the existing concurrent, deadline-bounded builder; the separate sequential builder is removed.
- [x] When the deadline expires, completed datasets are returned with the rest marked `timeout`.
- [x] Coverage is reported as counts against a documented denominator instead of `complete`.
- [x] The tool advertises one input schema per meaning, or both forms are documented as the same operation; skills and API docs that describe the tool match.
- [x] Tests cover all-success, one failure, and a deadline hit for the slug form; request budgets are respected.
