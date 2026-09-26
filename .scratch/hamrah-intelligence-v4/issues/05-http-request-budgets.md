# 05 — HTTP request budgets

**What to build:** The public MCP server bounds a single request's resource use and returns structured failures when request size, execution time, concurrency, or dataset scan limits are exceeded.

Blocked by: None — can start immediately

Status: done

**Phase:** 1

- [ ] HTTP behavior enforces a body size limit, operation deadline, concurrency cap, and maximum datasets scanned per call.
- [ ] Limits fail predictably without crashing the service or producing an incomplete success response.
- [ ] Fixed Visa Atlas fetches remain restricted to their approved host; user-controlled URLs cannot trigger arbitrary server-side fetches.
- [ ] HTTP and tool-boundary tests exercise each limit and an ordinary request.

