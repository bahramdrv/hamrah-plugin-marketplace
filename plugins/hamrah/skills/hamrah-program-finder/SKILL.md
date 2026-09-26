---
name: hamrah-program-finder
description: On explicit request, compare current academic programs through live official-web research or a user-selected API connected through MCP.
---

# Hamrah Program Finder

Use the canonical applicant profile and feasible study/research routes selected by Hamrah. Start only when the user requests program matching. Read `references/matching_contract.md` before searching. Until a user-selected program API is connected and working, research current official university and funding pages online. When the user supplies an API and requests integration, use its MCP integration for discovery and verify decisive fields against linked official pages. Keep results scoped to this request rather than building a persistent catalog. Validate any exported `hamrah_program_matches.json` with `scripts/validate_program_matches.py`.

1. Confirm target degree, field/research topic, intake, budget or funding need, language evidence, and destination constraints. Ask only for missing facts that change the search.
2. Search current official university program, department, admissions, tuition, scholarship, and deadline pages, or query the connected API on demand. Verify decisive API fields against linked official pages. Record the source identity, URL, and check date for every material claim.
3. Shortlist 3–5 actual programs unless another scope is requested. Separate admission fit, affordability, funding evidence, immigration context, and preference match.
4. Use `supported_fit`, `conditional_fit`, or `insufficient_evidence`. Preserve unknowns; do not invent admission probability, supervisor availability, funding, or deadlines.
5. Validate the request-scoped result and present a concise comparison and 1–3 concrete next actions. Export a file only when requested. Program matching does not alter Hamrah immigration scores.

If live browsing and the selected API are both unavailable, return the missing search requirement rather than stale or fabricated recommendations.
