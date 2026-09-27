# Manual acceptance cases: sample versus applicant journey

These anonymous prompts test user-visible behavior. Run with current official sources; program names and deadlines are deliberately not frozen. Score the response against the checks, rather than matching its wording. Do not turn these cases into published applicant evidence.

## Case A — physics graduate and fiancé; Program Finder sample

**Context:** The facilitator has been testing the limited Program Finder MVP and asks to try the following as a sample, not to conduct a full consultation.

**Input:** A recent Iranian physics graduate seeks a funded master's, prefers Germany, and has a fiancé who wants to work rather than study. They plan to marry before applying. The fiancé has self-taught programming skills, vocational certificates, and café-management experience, but no completed computing degree or documented IT employment. Traveling together and the spouse's right to work matter. English evidence and the exact research specialization are missing.

**Expected checks:**

1. Establish that the requested slice is German master's programs in physics or the explicitly stated subfield. Ask one scope question if the field cannot be determined from context; do not silently switch fields or countries.
2. On an explicit program-match test, return 3–5 named admissions programs with current official program links, or fewer with a coverage explanation. For each: `supported_fit`, `conditional_fit`, or `insufficient_evidence` with a reason; application status and deadline; funding status; tuition or affordability gap; Iranian-nationality evidence status; checked date; and material unknowns. A scholarship or professor page alone is not an admissions program or funded opening.
3. Treat the fiancé as unmarried until a marriage certificate exists. Keep spouse-work and visa-timing context separate from academic fit. Community delay reports may flag practical friction but cannot establish an official wait duration or approval chance.
4. Mark the missing language proof, funding for two, relevant course credits, and intake as gaps where applicable. Do not equate self-taught programming or café work with a completed IT degree or IT employment.
5. End with a brief test verdict: which checks passed, failed, or remain untested. Stop after the Program Finder slice. Do not produce a multi-country route ranking, investment plan, citizenship projection, or extended applicant interview.

**Observed before instruction change (2026-09-27):** Official links and family-visa friction were surfaced, but the response expanded into country and investment options. Program results omitted the explicit categorical fit and consistent application/funding/unknown fields. This case therefore failed checks 2 and 5; it did not establish a full route scorecard.

## Case B — minimal profile; direct program request

**Context:** A real applicant directly asks: “Find 3 current master's programs in physics in Germany. I have a physics bachelor's degree, but have no language score or funding details yet.” No prior route assessment exists.

**Expected checks:**

1. Start the program search directly with the known country, level, and field; do not require a complete immigration intake or scorecard.
2. Return three named programs with official pages and the same per-program fields as Case A. Every stated deadline identifies its intake and year; a recurring day/month without a confirmed intake remains an unknown dated deadline. Keep language and funding evidence `unknown` where unsupported, and make the resulting fit conditional or insufficient as appropriate.
3. Ask at most the next decision-changing question after the shortlist. Do not present a visa eligibility decision or immigration route ranking.

**Observed in installed-skill replay (2026-09-27):** The request went directly to program search and returned three named German physics master's programs with official links and most required fields. The visible deadline for at least one program was only a recurring day/month without an intake year, and another did not name the intake alongside the date. Check 1 and 3 passed; check 2 was partial. This is a behavioral observation, not a verified program catalog.

**Case A replay status (2026-09-27):** Not run. Automatic approval review rejected sending the sample profile through a separate CLI model replay because the payload contains personal details. The earlier, pre-change observation above is still the only behavioral result for Case A; do not infer a post-change pass.
