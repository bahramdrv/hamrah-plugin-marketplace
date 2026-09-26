Status: implemented

# Hamrah Evidence-Driven Immigration Intelligence

## Problem Statement

An applicant or facilitator cannot yet use Hamrah to compare immigration routes with a reliable account of official requirements, practical Iranian experience, academic opportunities, recurring questions, and uncertainty. The deployed product is primarily a Visa Atlas MCP adapter and a version 2 Community Signal store. Its deployed dataset directory is empty. The existing scorecard rules are largely expressed in skill guidance and a separate validator. A privacy metadata flag can stand in for inspection, a requirement with no source URL can pass validation with a warning, and changing facts have no enforceable freshness policy. The public MCP endpoint also lacks rate and concurrency controls.

The user needs answers that show exactly which evidence supports a conclusion, what is still unknown, and whether an apparent route is comparable with others. Hamrah must never turn a small, biased set of community reports into an approval probability.

## Solution

Build a version 4 Community Intelligence model with separate Signals, Questions, Academic Opportunities, Lived Experiences, Route Claims, and Evidence, backed by validated, versioned Git datasets. Add deterministic validation, provenance, privacy, source authority, freshness, deduplication, confidence, and route ranking gates in code. Use model interpretation to propose candidates for tasks such as semantic grouping, while deterministic validators decide whether an artifact can be published or used in scoring.

Expose read-only MCP tools for retrieval and assessment. Add a partial, deadline-bounded Route Fact Pack that gathers existing public Visa Atlas datasets concurrently. Introduce the Iranian Route Viability Index (IRVI) as a measure distinct from official eligibility, applicant fit, existing Practical Fit, Community Confidence, and any official approval statistics. A route can show a low-confidence numeric IRVI without verified recent Iranian examples, but it is unranked until its versioned Route Evidence Threshold is met. Seed the first reviewed evidence for German study routes and the Opportunity Card; all other countries and routes remain searchable and return explicit coverage or `research_required` states when evidence is absent.

The agreed scope is the `hamrah-plugin-marketplace` repository only. The earlier request for a code-enforced consent gate has been withdrawn. No approval page, consent token, or consent argument is part of this spec. The existing restriction that the Visa Atlas route-finder receives only documented coarse fields remains a separate data-minimization rule; it does not establish or verify consent.

## User Stories

1. As an applicant, I want to see official eligibility separately from practical route viability, so that I can understand what is legally supported and what is an evidence-based assessment.
2. As an applicant, I want an unknown official requirement to remain unknown, so that a missing source is not mistaken for a pass or fail.
3. As an applicant, I want stale decisive rules to block ranking, so that a changing threshold does not silently affect my comparison.
4. As an applicant, I want each decisive requirement linked to a verifiable source and review date, so that I can inspect its basis.
5. As an applicant, I want a provisional assessment clearly labeled, so that I do not confuse a research lead with official eligibility.
6. As an applicant, I want an IRVI score labeled as route viability rather than visa chance, so that I do not mistake it for an approval probability.
7. As an applicant, I want IRVI confidence shown beside the score, so that I can see when the evidence is weak.
8. As an applicant, I want a route with a provisional IRVI but insufficient Iranian evidence left unranked, so that an attractive number does not imply a supported comparison.
9. As an applicant, I want official approval statistics shown only when the authority supplies matching applications and outcomes for the stated population and period, so that community samples are not presented as official rates.
10. As an applicant, I want observed community successes and failures shown as biased observations, so that I do not treat their ratio as a probability.
11. As an applicant, I want reasons, major risks, missing requirements, and next actions for each route, so that I can act on the assessment.
12. As an applicant, I want the normal route result in Persian with source links and last verification dates, so that I can understand and inspect it.
13. As an applicant, I want a route's ideal candidate profile to distinguish official requirements from observed and community patterns, so that correlations do not become rules.
14. As an applicant, I want a missing source or failed provider reported as missing coverage, so that a technical failure is not interpreted as route closure.
15. As an applicant, I want to search recurring community questions in Persian or English, so that different phrasings lead to the same underlying question.
16. As an applicant, I want a frequently asked question answered from current official and community evidence, so that useful observations do not replace legal rules.
17. As an applicant, I want unresolved, outdated, and contradictory answers labeled, so that the system does not fill gaps with guesses.
18. As an applicant, I want to search academic opportunities by field, degree, institution, funding, and deadline, so that I can locate plausible programs.
19. As an applicant, I want unverified funding reported as unknown and expired deadlines marked stale, so that I do not plan around unsupported offers.
20. As an applicant, I want public evidence of recent Iranian participation reported only when the source explicitly establishes the Iran connection, so that nationality is never inferred from a name, appearance, or language.
21. As an applicant, I want ordinary results to omit individual names, so that I receive useful evidence without unnecessary personal details.
22. As an applicant, I want milestone-qualified successful cases distinguished from applications merely submitted, so that examples reflect actual progress.
23. As an applicant, I want refusals and operational failures scoped by date, route, and applicant context, so that negative evidence informs me without becoming a universal claim.
24. As an applicant, I want community claims framed as patterns with supporting and opposing evidence, so that one anecdote is not treated as policy.
25. As an applicant, I want independent reports counted once even when copied across communities, so that repetition does not falsely increase confidence.
26. As an applicant, I want a private community report used only for context or warning, so that an uninspectable source does not determine a public ranking.
27. As a facilitator, I want the same country and route queried across multiple datasets, so that I can see combined evidence and its coverage.
28. As a facilitator, I want source families, copy risk, independence groups, and contradictions retained, so that I can explain the basis of a claim.
29. As a facilitator, I want changing evidence to keep its history, so that a superseded claim remains auditable.
30. As a facilitator, I want Evidence Confidence computed separately from applicant fit and IRVI, so that the measures answer different questions.
31. As a facilitator, I want Route Evidence Thresholds versioned per route, so that ranking requires an explicit evidence policy rather than a universal anecdote count.
32. As a facilitator, I want a Route Fact Pack with successful, failed, and timed-out datasets and coverage, so that partial upstream results are usable without appearing complete.
33. As a facilitator, I want a bounded total deadline for Route Fact Pack retrieval, so that one upstream failure cannot stall the entire assessment.
34. As a facilitator, I want public Visa Atlas GET operations available without a consent gate, so that general research stays accessible.
35. As a facilitator, I want route-finder requests limited to documented coarse fields, so that detailed applicant data is not transmitted by that tool.
36. As a facilitator, I want a source's authority evaluated for the specific claim, so that an official university page supports admission facts but not immigration law outside its authority.
37. As a facilitator, I want unrecognized sources usable as provisional leads only, so that they cannot produce official `PASS` or `FAIL` results.
38. As a facilitator, I want current official, Iran-specific, community, and opportunity evidence shown separately, so that one evidence class cannot silently stand in for another.
39. As a researcher, I want extraction to create Evidence Candidates before publication, so that model interpretation can be checked against deterministic rules.
40. As a researcher, I want semantically duplicate questions clustered while independent askers are counted accurately, so that popularity is not inflated by wording or cross-posting.
41. As a researcher, I want community claims checked for official support, opposing evidence, recency, and scope, so that validation is reproducible.
42. As a researcher, I want structured `research_required` results when no approved provider can fetch evidence, so that the system never invents a source.
43. As a researcher, I want public-person evidence URLs retained only after privacy validation, so that a reader can verify a milestone without publishing unnecessary identifiers.
44. As a dataset publisher, I want each artifact to have a stable deterministic ID, so that re-importing the same claim does not create duplicates.
45. As a dataset publisher, I want version 2 and version 3 datasets readable through explicit migration, so that existing data remains accessible as version 4 is introduced.
46. As a dataset publisher, I want raw results kept outside the published store until all validation stages pass, so that discovery cannot silently become fact.
47. As a dataset publisher, I want `fail` and `needs_review` privacy statuses excluded from publication and scoring, so that uncertain identifiers do not reach users.
48. As a dataset publisher, I want contact details, handles, IDs, addresses, and unnecessary names detected in community evidence, so that redaction metadata cannot substitute for inspection.
49. As a dataset publisher, I want provenance, content hashes, collection dates, and source changes retained, so that historical evidence remains traceable.
50. As a dataset publisher, I want automatic publication to be fail-closed with a withdrawal path, so that a later discovered privacy problem can be corrected.
51. As an API consumer, I want separate tools for searching and retrieving questions, opportunities, lived experiences, and route claims, so that artifact types retain their meaning.
52. As an API consumer, I want read-only assessment tools distinct from an explicit persistence command, so that ordinary research calls cannot mutate published data.
53. As an API consumer, I want structured errors and coverage diagnostics, so that I can tell an empty result from a validation, provider, or timeout failure.
54. As a service operator, I want request size, request rate, per-origin concurrency, deadline, fan-out, and dataset-scan bounds, so that public MCP calls cannot exhaust the service.
55. As a service operator, I want server-side fetches restricted to approved destinations, so that a tool argument cannot trigger an arbitrary URL request.
56. As a service operator, I want CI to reject invalid schemas, unsafe datasets, failing Python validators, and regression tests, so that deployment cannot bypass publication gates.
57. As a maintainer, I want each phase to leave tests green and modules small, so that the nine-phase migration remains reviewable.

## Implementation Decisions

### Scope and compatibility

- Modify and publish the Hamrah plugin marketplace only. The separate Immi application is outside this effort.
- Keep existing MCP names and response fields where possible; add versioned fields or tools without silently changing the meaning of existing scores. Continue to read legacy version 2 and the installed version 3 Community Signal contracts through explicit adapters. New canonical output uses `schema_version: "4.0.0"`.
- Preserve the current five importable skills and update their instructions, schemas, and examples to use the new deterministic services. A skill may interpret source material and propose Evidence Candidates; code validates publication and scoring.
- Implement work in the requested order: (1) security, privacy, source, and freshness corrections; (2) version 4 schema and migration; (3) questions and FAQ; (4) Route Claims; (5) Academic Opportunities; (6) Iranian Lived Experiences; (7) IRVI; (8) route discovery and ideal profile; (9) CI, documentation, and release verification. Each phase ends with green relevant tests.

### Existing boundaries and external requests

- The earlier consent-gate requirement is superseded by the user's explicit decision. No code gate, approval page, token, or `consent_required` error is introduced. The server does not claim to verify consent.
- Independently, keep the existing route-finder argument allowlist and transmit only documented coarse fields. Reject extra or detailed profile fields before network access. The current server checks field names but does not enforce the declared value types, lengths, ranges, or enums at runtime; enforce those constraints before POST and reject sensitive detail embedded inside otherwise allowed string fields.
- Add `getRouteFactPack` as a Hamrah composition tool, because no such tool exists in the current repository. Fetch the selected public Visa Atlas datasets concurrently under one operation-wide deadline. Return partial data with per-dataset `success`, `failure`, or `timeout` outcomes and a documented coverage denominator.
- Keep public Visa Atlas GET operations ungated. Distinguish a missing upstream endpoint from an empty dataset and preserve the existing explicit 404 behavior.
- Place all external retrieval behind bounded EvidenceProvider interfaces. Providers return provenance, source type, retrieval time, rate or failure status, and an explicit unsupported/research-required outcome. The core MCP service does not scrape arbitrary web URLs or bypass site authentication.
- Limit public MCP request bytes, request rate by IP and available session identifier, concurrent requests, total operation duration, tool fan-out, and dataset scans. Apply an allowlist and SSRF defenses to any future URL-taking provider; the existing fixed Visa Atlas base remains fixed.

### Version 4 evidence and publication

- A Community Dataset contains independent collections of Signals, Questions, Academic Opportunities, Lived Experiences, Route Claims, Sources, and Evidence. Artifact IDs, cross-references, source coverage, and validation states have defined schemas. A Signal is not a container for unrelated artifacts.
- Generate stable IDs with SHA-256 over normalized source identity, claim or question identity, country, route, event date, and entity where applicable. Use deterministic collision handling and preserve IDs across re-imports. Never use random IDs for these artifacts.
- Record `first_seen`, `last_seen`, `event_date`, `collected_at`, and `verified_at` where applicable. Preserve `active`, `monitoring`, `resolved`, `historical`, `stale`, and `superseded` lifecycle distinctions without deleting history.
- Each evidence record carries a source ID, canonical locator when public, retrieval time, publication or event date when known, content hash, source type, authority, and quality profile. Changes create new historical evidence rather than overwrite the former observation.
- The publication pipeline is discover → normalize → deduplicate → privacy check → provenance check → evidence validation → contradiction check → schema validation → persistence. Raw discovered results and Evidence Candidates never enter the published store directly.
- Automated publication requires every mandatory check to pass. `fail` and `needs_review` privacy results stay outside both the published store and scoring. There is no standing human approval step; publication diagnostics and withdrawal or supersession remain available.
- Privacy checks inspect artifact content and embedded locators for email, phone, handles, Telegram and account IDs, application and passport/national identifiers, addresses, unnecessary full names, and embedded contact details. A `redacted` flag or similar metadata alone cannot produce `pass`. Whitelists are narrow, field-specific, justified, and auditable; a public-person URL may be retained in provenance when it is necessary and passes review.
- Semantic grouping may use model interpretation to propose candidate clusters. Publication uses deterministic requirements for evidence links, canonical IDs, independence, counts, and uncertainty; ambiguous candidates remain `needs_review` and unpublished. Cross-source copies share an independence group rather than adding votes.

### Source, time, and official eligibility

- Use a versioned, changeable automatic Source Authority classification tied to both the source identity and the kind of claim. A title or domain appearance alone is insufficient. A decisive official requirement needs a real URL, a classified primary or explicitly trusted authority for that requirement, and current evidence. Unrecognized authority can support a Provisional Assessment but not official `PASS` or `FAIL`.
- Validate real ISO dates and date-times, including `checked_at`, `retrieved_at`, `published_at`, `effective_from`, and `effective_until`; reject impossible dates. Apply versioned freshness rules by fact type, including salaries, fees, occupation lists, funding and application deadlines, quotas, processing times, and financial requirements. Return `current`, `aging`, `stale`, or `unknown` with age and maximum age.
- A stale decisive official fact or unresolved source conflict prevents ranking. Keep official eligibility status separate from applicant fit, existing Practical Fit, IRVI, Community Confidence, and official approval statistics. A non-official source cannot establish a legal rule.
- Accept official approval statistics only with an authoritative source, population, period, numerator, and denominator. Validate arithmetic and describe the statistic independently of community observations.

### Questions, claims, opportunities, and experiences

- Extract Questions from community and public sources into canonical Persian and English questions with variants, countries, routes, topics, process stages, first and last seen dates, independent asker count, trend, evidence links, and answer status. Semantic duplicates merge without double-counting the same asker or copied source.
- The FAQ answer engine collects community and relevant official evidence, checks contradictions and freshness, and returns `official`, `evidence_based`, `community_observation`, or `unresolved` with confidence and citation sets. Missing support yields `unresolved` rather than generated certainty.
- Route Claims preserve claim type, process stage, applicant scope, official and community evidence, opposing evidence, independence count, probability language, and deterministic Evidence Confidence. A single anecdote remains weak; correlated reports count once; contradictions reduce confidence without being discarded.
- Academic Opportunities are separate artifacts with institution, department/program, field, degree, supervisor where relevant, funding components, admission requirements, deadline, nationality restrictions, source provenance, freshness, and Iranian evidence status. Unknown funding remains unknown. Expired opportunities stay historical rather than appear open.
- Iranian Lived Experiences require an explicit public statement or document establishing the Iran connection. Names, appearance, language, and ambiguous education history do not establish nationality. Store minimum necessary public-person information and omit names from ordinary output. A successful case requires a route-specific attained milestone; applications merely submitted remain claims. Capture failures and delays with the same scope discipline.
- Preserve supporting and opposing evidence in contradiction groups with possible date, embassy, program, profile, or policy-change explanations labeled as hypotheses rather than invented facts. Track source quality, first-handness, copy risk, and negative cases.

### Confidence, viability, and route discovery

- Compute Evidence Confidence deterministically from evidence diversity, independent reports, primary-source support, recency, scope match, data quality, and contradiction penalties. Return a 0–100 score, label, component breakdown, and explanation. It describes support for a claim, not probability of an outcome.
- Define IRVI separately from the existing scorecard Practical Fit. Its versioned rubric combines official accessibility, applicant compatibility, execution practicality, Iran-specific restrictions and evidence, recent qualified examples, funding or sponsorship, evidence quality, and community friction. Publish the component breakdown and uncertainty. Never label IRVI as approval probability.
- A current, source-backed route may receive a low-confidence numeric IRVI without a verified recent Iranian example. It remains unranked until its versioned Route Evidence Threshold is met. Thresholds are route-specific, set after evidence review, and missing thresholds block ranking. Official `FAIL`, decisive stale data, or unresolved official requirements also block ranking.
- Private Community Evidence can provide context or warnings but cannot make a route rankable or change its public rank. Public, independently inspectable evidence and current official sources determine ranking eligibility.
- `findViableRoutesForIranians` identifies lawful candidates, checks eligibility and Iran-specific restrictions, joins the relevant evidence and opportunities, applies scope and freshness rules, and returns only rankable routes in ranked results; unranked candidate assessments remain separately visible with reasons. `getIranianRouteViability` exposes the per-route assessment. `getIdealCandidateProfile` labels each characteristic as `official_requirement`, `observed_success_pattern`, or `community_pattern`, with evidence links and no inferred sensitive traits.

### MCP surface and output

- Add read-only tools `searchCommunityQuestions`, `getCommunityQuestion`, `answerCommunityQuestion`, `searchAcademicOpportunities`, `getAcademicOpportunity`, `searchIranianLivedExperiences`, `getLivedExperience`, `searchRouteClaims`, `validateRouteClaim`, `getIranianRouteViability`, `findViableRoutesForIranians`, and `getIdealCandidateProfile`, plus `getRouteFactPack`. Persistence remains a distinct explicit command or tool.
- All retrieval and assessment responses include artifact identity, provenance, freshness, verification and privacy status where relevant, evidence coverage, and structured failure or `research_required` states. No claim lacking provenance, freshness, or evidence status enters a final answer. Ordinary user-facing summaries are in Persian.
- The first reviewed Git evidence targets German study paths and the Opportunity Card. General tools accept other countries and routes, but report their coverage honestly. No source or case is invented to populate a route.

## Testing Decisions

- Test externally visible outcomes at four agreed seams: MCP tool calls with controlled providers and datasets; dataset publication followed by loading and search; HTTP requests to the remote MCP server; and complete scorecard-validator input/output. Prefer these integration seams over tests that mirror helper functions. Use the current MCP tool tests, temporary dataset fixtures, and Python validator tests as prior art.
- Phase 1 tests cover the withdrawn consent-gate decision by preserving public GET and coarse-field POST behavior without adding a consent error; reject extra keys, invalid values, and sensitive detail embedded in allowed strings before network access. Cover privacy detection and fake-redaction metadata; official source URL and authority rules; impossible dates, freshness, stale ranking gates; bounded HTTP requests, concurrency, rate, fan-out, and URL safety.
- Phase 2 tests cover version 2 and version 3 migration into version 4, deterministic IDs, artifact links, cross-dataset duplicates, privacy gating, provenance, withdrawal, and historical snapshots.
- Phase 3 tests cover paraphrase deduplication, independent asker counts, stale or contradictory FAQ answers, and explicit unresolved responses.
- Phase 4 tests cover one anecdote remaining weak, independent corroboration increasing Evidence Confidence, copied reports counting once, contradictions decreasing confidence, and scope limits.
- Phase 5 tests cover expired deadlines, unverified funding, program filters, and source-backed Iranian evidence status.
- Phase 6 tests cover rejecting nationality inference from a name, accepting explicit public Iran evidence, qualified milestones, negative cases, and name omission in ordinary results.
- Phase 7 tests cover four-way score separation, numeric but unranked low-confidence IRVI, route-specific thresholds, official `FAIL`, stale official facts, private evidence exclusion, and no community-derived approval probability.
- Phase 8 tests cover route discovery, missing coverage, ideal profile provenance labels, Persian summaries, and `research_required` when providers are unavailable.
- Phase 9 CI runs `npm ci`, Node tests, schema validation, privacy and published-dataset validation, Python validators, and practical static/security checks. A published dataset with privacy `fail` or `needs_review` fails CI. Run relevant tests after each phase and the full suite at release.

## Out of Scope

- Changes to the separate Immi application or the Visa Atlas upstream service.
- A user-facing consent page, consent token, consent argument, or code-enforced consent gate; this was explicitly removed after the original brief.
- Login bypass, private LinkedIn scraping, arbitrary web scraping in the core MCP server, or claiming unavailable host research capabilities.
- Deriving nationality from names, photographs, language, or other indirect traits.
- Calling any community sample ratio a visa approval probability.
- Treating route viability, applicant fit, Evidence Confidence, existing Practical Fit, or official approval statistics as interchangeable.
- Ranking routes whose current official basis or route-specific evidence threshold is missing.

## Further Notes

- The current repository has no `getRouteFactPack`, no canonical version 3 schema, and no deployed community datasets. The installed Hamrah skill package has a version 3 contract; migration must use that actual contract rather than assume version 3 matches version 2. The initial Node test suite passed 14 of 14 tests before this spec.
- The source repository has a local dataset publication command and a deployed Git-backed dataset directory. The spec requires the publication path to be explicit, so a successful local write is not mistaken for a deployed dataset.
- Automatic privacy checks can miss identifiers, especially names and embedded context. Ambiguous findings fail closed as `needs_review`; the published data needs a withdrawal/supersession mechanism. The owner chose automatic validation rather than a human publication step.
- Exact source-classification rules, fact-type freshness limits, confidence weights, IRVI weights, and Route Evidence Thresholds must be versioned, evidence-reviewed decisions during implementation. Their output contracts and ranking gates above are fixed by this spec; their numeric values should not be invented before reviewing initial evidence.
