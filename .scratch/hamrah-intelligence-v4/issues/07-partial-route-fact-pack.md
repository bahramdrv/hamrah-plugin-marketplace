# 07 — Partial Route Fact Pack

**What to build:** A facilitator can request one Route Fact Pack that fetches selected public Visa Atlas datasets concurrently and still returns traceable partial coverage when one dataset fails or times out.

Blocked by: 05 — HTTP request budgets

Status: done

**Phase:** 1

- [ ] The new read-only MCP tool uses fixed approved upstream endpoints, bounded fan-out, and one operation-wide deadline.
- [ ] The response identifies each successful, failed, and timed-out dataset and states its coverage denominator and percentage.
- [ ] An unavailable upstream endpoint is not confused with an empty dataset, and no missing facts are invented.
- [ ] MCP tests demonstrate concurrency, a global timeout, and a partial result with preserved source metadata.

