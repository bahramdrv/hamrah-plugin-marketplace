# 01 — Strict route-finder input

**What to build:** A facilitator can call the existing route-finder with a coarse profile, while detailed or malformed applicant data is rejected before any Visa Atlas POST. Public Visa Atlas GET tools continue to work without a consent gate.

Blocked by: None — can start immediately

Status: done

**Phase:** 1

- [ ] Only the documented route-finder fields reach the fixed Visa Atlas endpoint; extra keys, invalid types, ranges, enums, and sensitive detail embedded in allowed strings produce structured errors before network access.
- [ ] A valid coarse request still receives the existing route-finder response; no consent argument or consent error is introduced.
- [ ] MCP boundary tests prove both the accepted request and zero network calls for rejected requests.

