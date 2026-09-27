---
name: hamrah-program-finder
description: On explicit request, shortlist current academic programs using the applicant's relevant facts and live official-web research or a user-selected API connected through MCP.
---

# Hamrah Program Finder

Start when the user explicitly requests academic program matching, even if no immigration route has been assessed. Read `references/matching_contract.md` before searching. Use the canonical profile when available; otherwise collect only the facts that change this search. Until a user-selected program API is connected and working, research current official university and funding pages online. When the user supplies an API and requests integration, use its MCP integration for discovery and verify decisive fields against linked official pages. Send only search terms needed for discovery to an external source; compare personal profile facts within Hamrah. Keep results scoped to this request rather than building a persistent catalog. Validate any exported `hamrah_program_matches.json` with `scripts/validate_program_matches.py`.

1. Establish the requested country, degree, and field. Use known intake, budget or funding need, language evidence, and destination constraints; ask only for missing facts that change the shortlist. A complete immigration profile is not required.
2. Search current official university program, department, admissions, tuition, scholarship, and deadline pages, or query the connected API on demand. Verify decisive API fields against linked official pages. Record the source identity, URL, and check date for every material claim.
3. Shortlist 3–5 named admissions programs with official program pages unless another count is requested. An Academic Opportunity may provide evidence, but a professor or laboratory page alone does not establish a program or open position. Keep the search within the requested field.
4. Separate academic admission fit, affordability, funding, Iranian applicant evidence, immigration context, and preference match. Use `supported_fit`, `conditional_fit`, or `insufficient_evidence` with reasons and gaps, not a numeric match score. Preserve unknown deadlines, funding, and nationality conditions as unknown; distinguish an unknown deadline from a confirmed open intake.
5. Present each program with its official link, checked date, material sources, reasons, gaps, and 1–3 concrete next actions. Export a request-scoped file only when requested, validate it first, and keep academic matching separate from Hamrah immigration scores.

If live browsing and the selected API are both unavailable, return the missing search requirement rather than stale or fabricated recommendations.
