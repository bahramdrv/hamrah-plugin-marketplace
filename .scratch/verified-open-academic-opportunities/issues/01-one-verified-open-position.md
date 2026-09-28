# 01: One Verified Open Academic Opportunity

**What to build:** On an explicit request for a funded doctoral physics opening in Germany, Hamrah can research a live official advertisement and show one Verified Open Academic Opportunity through a public-fact validation and rendering seam. The visible result identifies the exact opening, official application page, check date, current application acceptance, a future deadline or explicitly rolling call, and specific officially verified salary or stipend terms.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] A specific official advertisement with current application acceptance and official funding terms produces one source-linked visible result. The result is request-scoped and does not enter the published evidence store.
- [x] A professor profile, generic program page, stored `active` value, future deadline without present application acceptance, expired deadline, filled call, or vague funding claim cannot be rendered as a verified open funded position.
- [x] The public renderer receives only public opening facts and caller-supplied official excerpts; it rejects inconsistent status or missing decisive evidence and returns the complete visible status block as primary text. Applicant facts do not enter this call.
- [x] The research flow verifies each excerpt on the current official page before calling the renderer and reports `research_required` when live sources cannot be checked. The renderer does not claim to authenticate a page itself.
- [x] Deterministic tests exercise valid and invalid behavior at `executeTool`, reusing the existing program-presentation pattern without requiring live network access.

See the feature specification in the parent directory for scope, terminology, and privacy boundaries.
