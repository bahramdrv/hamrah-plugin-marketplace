# 06 — Rate limiting

**What to build:** A service operator can protect the remote MCP endpoint from repeated calls by one origin while ordinary callers receive usable responses.

Blocked by: 05 — HTTP request budgets

Status: done

**Phase:** 1

- [ ] Per-IP and available per-session budgets produce a structured 429 response with retry guidance when exceeded.
- [ ] The mechanism remains effective in the intended serverless deployment rather than only within one process instance.
- [ ] Different callers do not share the same budget inadvertently; spoofed client headers do not bypass the origin policy.
- [ ] HTTP tests cover allowed, throttled, recovered, and distinct-origin requests.

