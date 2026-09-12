---
name: hamrah-program-finder
description: Find and compare current university degrees, fields, supervisors, admissions requirements, funding, tuition, and deadlines for a normalized Hamrah profile after immigration-route screening.
---

# Hamrah Program Finder

Use the canonical applicant profile and feasible study/research routes selected by Hamrah. Read `references/matching_contract.md` before searching and validate `hamrah_program_matches.json` with `scripts/validate_program_matches.py`.

1. Confirm target degree, field/research topic, intake, budget or funding need, language evidence, and destination constraints. Ask only for missing facts that change the search.
2. Search current official university program, department, admissions, tuition, scholarship, and deadline pages. Use aggregators only for discovery. Record the URL and check date for every material claim.
3. Shortlist 3–5 actual programs unless another scope is requested. Separate admission fit, affordability, funding evidence, immigration context, and preference match.
4. Use `supported_fit`, `conditional_fit`, or `insufficient_evidence`. Preserve unknowns; do not invent admission probability, supervisor availability, funding, or deadlines.
5. Write and validate the JSON, then present a concise comparison and 1–3 concrete next actions. Program matching does not alter Hamrah immigration scores.

If live browsing is unavailable, return the missing search requirement rather than stale or fabricated recommendations.
