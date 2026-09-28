# Verified Open Academic Opportunities — first request-scoped slice

Status: ready-for-agent

## Problem Statement

An applicant can already request a source-linked Academic Program Match, and Hamrah can search Academic Opportunities that were previously published in its evidence store. Neither path establishes that a specific funded doctoral research opening is accepting applications now. The store currently has no published opportunities for this sample scope, and a stored `active` lifecycle value alone does not prove current application availability. A professor or program page may be mistaken for an opening, and an old deadline or vague funding statement may be mistaken for a usable funded call.

## Solution

On an explicit request, research live official institution or employer pages for advertised doctoral research positions. The first acceptance scope is physics in Germany. Present three to five Verified Open Academic Opportunities when available, or fewer with honest coverage. Each visible result identifies the exact opening, official application page, check date, evidence that applications are being accepted now, the named deadline or explicitly rolling call, verified salary or stipend terms, decisive applicant conditions, and the evidence status for Iranian nationality. Compare those conditions with only the academic facts the applicant has supplied. Keep the result request-scoped and do not publish a standing opportunity catalog.

## User Stories

1. As an applicant, I want to ask directly for funded doctoral physics openings in Germany, so that I can search without first completing an immigration scorecard.
2. As an applicant, I want each result to name an advertised opening, so that I do not mistake a university, professor, laboratory, or admissions program for a vacancy.
3. As an applicant, I want a direct official application link, so that I can inspect the call and apply through the stated channel.
4. As an applicant, I want the date each official page was checked, so that I know when the answer was verified.
5. As an applicant, I want an opening called "open" only when its current official page explicitly confirms applications are being accepted, so that a stored lifecycle label cannot mislead me.
6. As an applicant, I want a future dated deadline tied to that exact call or an explicitly rolling call, so that a recurring date is not projected onto an unannounced intake.
7. As an applicant, I want expired, filled, withdrawn, and unverified openings excluded from the open shortlist, so that I do not plan around an unavailable call.
8. As an applicant, I want a listed salary or stipend backed by an official source with specific terms, so that vague claims of funding are not presented as a funded position.
9. As an applicant, I want salary, stipend, duration, and conditions kept distinct where the source does so, so that I can judge what the funding covers.
10. As an applicant, I want the official academic and employment conditions linked to their sources, so that I can inspect the basis for an apparent fit or gap.
11. As an applicant, I want my supplied academic facts compared with those conditions, so that I can see supported points and missing proof without a numeric admission chance.
12. As an applicant with a minimal profile, I want a useful shortlist with explicit unknown fit details, so that missing profile facts do not prevent discovery.
13. As an Iranian applicant, I want an unstated nationality condition labelled unknown, so that silence is not mistaken for permission or restriction.
14. As an Iranian applicant, I want a position with an explicit official restriction that excludes me left out of the shortlist with the reason shown, so that I do not spend time on an ineligible call.
15. As an applicant, I want fewer than three results or zero reported honestly with the search scope and exclusion reasons, so that missing coverage is not interpreted as no opportunities existing.
16. As an applicant, I want the search to stay within the country, degree, and field I requested, so that Hamrah does not silently broaden my goal.
17. As an applicant, I want a brief next action and at most the next decision-changing question, so that I can act on the shortlist without an unrequested immigration consultation.
18. As a facilitator, I want an anonymous sample replay graded against observable checks, so that I can tell whether the user-visible feature works rather than trusting the model's self-reported verdict.
19. As an applicant, I want my personal academic details kept out of the public-fact renderer, so that a validation call does not receive more information than needed.

## Implementation Decisions

- Keep discovery on explicit request. The Hamrah skill researches current official institution and employer pages using live web access. The existing published Academic Opportunity store may supply leads, but a stored record never substitutes for rechecking the current official page. If live research is unavailable, return a research requirement rather than stale or invented results.
- Use a dedicated public-fact validation and rendering seam at `executeTool`, following the existing program-shortlist pattern while keeping the opportunity contract separate from Academic Program Match. The renderer accepts only public opening facts and caller-supplied official excerpts. Its primary text is the complete visible status block. It validates structure and internal consistency; it does not fetch or authenticate official pages. The research step must inspect those pages before supplying excerpts.
- Keep applicant-specific comparison outside the MCP renderer in the local skill flow. A source-linked fit note may use the already rendered public conditions, but the applicant profile, personalized reasons, and gaps do not enter the public renderer.
- A Verified Open Academic Opportunity needs an exact advertised opening, current official evidence of application acceptance, and either a future deadline for that call or an explicitly rolling application statement. An `active` store status, a generic program page, a faculty profile, or a future deadline without present application acceptance is insufficient.
- For the first slice, a result also needs officially verified salary or stipend terms specific to that opening. A salary scale or a specified stipend package counts; a generic promise that funding may be available does not. Unknown or disputed funding excludes the opening from this funded shortlist and is reported as an exclusion reason when relevant.
- Show the official restriction that excludes Iranian applicants as an exclusion, not a match. When the official page is silent, record nationality evidence as unknown. Do not infer nationality eligibility from a university's location or a past applicant.
- Keep opening availability, funding, academic fit, nationality evidence, and immigration context separate. Do not calculate an admission or visa probability or map a position to an official visa outcome.
- Search the requested scope and aim for three to five results. Return fewer, including zero, with coverage and exclusion counts or reasons. Do not silently expand to another country, field, degree, or position type.
- A supervisor name or contact is shown only when part of the specific official advertisement; it is not a separate professor search or evidence of another opening.
- Do not persist request results as published evidence. A later publication workflow, if requested, remains a separate decision and must use the existing validation and privacy gate.

## Testing Decisions

- Test user-visible behavior at the public `executeTool` seam: a valid officially evidenced open call renders with one status and required sources; missing open evidence, an expired deadline, vague funding, conflicting official funding, an unrelated professor page, and explicit Iranian exclusion cannot appear as eligible shortlist entries.
- Test structural rules with deterministic fixtures and without external network dependence, following the existing Program Finder presentation tests and Academic Opportunity verification tests. Do not write tests that merely mirror a formatter's implementation.
- Run anonymous manual acceptance replays with current official pages for a Germany/physics/doctorate request with minimal academic facts and a case with material gaps. Check each displayed official excerpt against its page during the replay. Grade each expected behavior independently; the renderer's successful return alone cannot establish source authenticity.
- Verify that public renderer inputs exclude applicant details and that the final answer retains its complete validated status blocks and source-linked private fit notes.
- Run the repository's required Node, release, static, and Python checks before any commit.

## Out of Scope

- Searching for professors to contact without a specific advertised opening.
- General Academic Program Match expansion, unfunded programs, or speculative scholarships.
- Persistent opportunity catalog creation, automatic scheduled monitoring, and publication of live search results.
- Adding a university or job API before the owner selects one; login-only pages, private scraping, or arbitrary scraping inside the core MCP server.
- Full immigration intake, official route eligibility, visa timing, or admission and visa probability.
- Widening the first acceptance scope beyond German doctoral physics openings without a new request.

## Further Notes

- The existing Academic Opportunity store and read-time verifier remain useful for published historical evidence. They do not currently provide the request-scoped live search or the strict Verified Open Academic Opportunity presentation gate described here.
- The domain glossary already distinguishes Academic Opportunity, Academic Program Match, and Verified Open Academic Opportunity. No new ADR is needed for this reversible feature boundary; existing source, privacy, and publication ADRs still apply.
