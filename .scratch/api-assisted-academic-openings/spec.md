# API-assisted open academic calls — draft for owner confirmation

Status: approved by owner

## Problem

Hamrah's existing Verified Open Academic Opportunity flow can present a researched doctoral vacancy and validate caller-supplied excerpts, but it has no connected live opportunity search API. `searchAcademicOpportunities` searches only previously published Hamrah datasets. The current renderer does not fetch or authenticate the official page and its visible block is English. A repeated request can therefore vary with the host's web search and the underlying postings. The owner wants a dependable, consistent search workflow that uses free APIs and web search together and always returns an honest structured response.

## Agreed scope and input

- Start only on an explicit academic-opening request. This slice searches specific open Master's and doctoral admission calls, Master's and doctoral funding calls, doctoral research vacancies, postdoctoral vacancies, and research jobs. University listings, professor profiles, general program descriptions, field recommendations, and immigration routes are separate paths.
- Require a research field/topic and target level or opening type. If either is missing, return the same versioned response shape with `needs_input` and one targeted question. Country is optional; absent country permits a global search. A supplied country or narrower scope is respected.
- Use the existing applicant profile only for local academic comparison when available. Missing applicant facts remain unknown. Send only general search terms, level, and geography to external services, never applicant identity, citizenship, grades, publications, finances, or private fit reasons.
- The default visible shortlist is three to five verified results, or the actual number including zero. A user-supplied limit overrides the default within a bounded maximum. Every result carries both `kind` (`admission_call`, `funding_call`, or `research_vacancy`) and `targetCategory` (`masters`, `phd`, `postdoc`, or `research_job` as applicable), so an admission, award competition, and job cannot be mistaken for one another. A PhD request may return all three kinds with separate evidence.

## Discovery and source policy

- Query eligible no-cost structured sources and perform bounded web search within the same request. Candidate connectors to validate first are the [DAAD PhDGermany RSS feed](https://api.daad.de/api/feeds/rss/en/phd.xml) and public, organization-scoped job-board APIs from [Greenhouse](https://docs.greenhouse.io/job-board.html), [Lever](https://github.com/lever/postings-api), and [Ashby](https://developers.ashbyhq.com/docs/public-job-posting-api). A connector is included only after its live access, use terms, useful academic coverage, and failure behavior are checked. These are discovery sources, not universal catalogs. The organization-scoped APIs need known board identifiers; do not invent them or claim all institutions are covered.
- A free registration/key or free quota is acceptable only with a hard cap that prevents paid usage. Paid plans and paid overages are out of scope. If a source's financial terms are unverified, do not activate it as a free connector. [France Travail](https://www.data.gouv.fr/dataservices/api-offres-demploi) remains a candidate pending access and cost verification.
- Use current public web search to fill API gaps and to find an official posting. [EURAXESS](https://euraxess.ec.europa.eu/jobs/search) may supply web leads, but its documented [XML API](https://euraxess.ec.europa.eu/api/xmlguidelines) is for submitting postings, not public read search. [Erasmus Mundus](https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/erasmus-mundus-joint-masters) can lead to Master's programs; the program's own site must establish its current admission and scholarship calls.
- Support every country a connected API actually covers; do not silently restrict all searches to Germany. A global request is bounded and does not imply exhaustive examination of every posting in every country. Report the sources, countries, queries/scopes, candidate counts, truncation, failures, and parts not searched. For a country/type without a suitable free API, officially verified web findings may still be shown with `api_coverage: unavailable` and `discovery_method: web_search`.
- A caller-supplied official publisher board supplements eligible built-in boards for the same request; duplicate board identifiers are fetched once. It must not silently replace existing source coverage.
- Deduplicate the same call across API and web leads by the official posting/application identity, retaining all discovery paths in the trace. The current implementation does not persist request results or private applicant data.
- Future option raised by the owner: an ephemeral shared cache on Vercel could retain public, source-linked discovery leads from prior requests, check those leads first, and then perform fresh API/web discovery. This is not active. Before implementing it, confirm source terms allow retention, define a short TTL and deletion policy, bound read/write cost, and ensure no applicant profile or user query history is stored. A cache hit is always rechecked against the exact current official publisher page; it cannot by itself establish an open call or suppress the fresh search. Compare hit rate, latency, stale-lead rate, and cost with the current stateless path before adopting it.

## Verification and result rules

- A result joins the verified-open shortlist only when a current official publisher page or official publisher API identifies the exact call, confirms application acceptance now, provides a future deadline for that call or an explicit rolling status, and supports its decisive conditions with source URLs and check dates. Search results, aggregators, a future deadline alone, a generic program page, and an `active` dataset flag are insufficient. Search for another official page when the first is incomplete; if confirmation remains missing, count the candidate as unverified and exclude it from the shortlist.
- The public renderer fails closed on obvious closed/not-yet-open wording and requires an explicit rolling phrase for rolling mode. Its checks are structural and based on caller-supplied excerpts; the host still must inspect the official live page. Unrecognized-language rolling wording may need further review before the call can qualify.
- Master's and doctoral admissions and scholarships remain distinct calls. Link a scholarship to a program when official scholarship terms cover that program and intake directly, or cover a broader eligible class that the program and intake demonstrably belong to; exclusivity is not required. Show a competitive scholarship as `competitive`, with its own terms, deadline, and conditions; eligibility to apply is not a guaranteed award or guaranteed funding of the admission. A doctoral admission is not a doctoral research job without a separate advertised employment contract or position.
- For a request explicitly requiring funding, exclude entries with unknown or unsupported financial terms from the qualifying funded list. Keep a source-backed competitive funding route visibly separate from verified salary, stipend, or noncompetitive support. For a general opening search, an open item with unknown funding may appear below verified funding and must be marked `unknown`.
- Keep application status, funding, academic fit, Iranian-nationality evidence, and immigration status separate. An explicit current official nationality exclusion removes an ineligible call with a cited reason; silence remains `unknown`. Do not compute an invented Iran-compatibility, admission-chance, visa-chance, or academic-match percentage.
- Compare published academic conditions only with supplied applicant facts. Use `supported`, `unverified`, and `not_met` per condition; never fill a gap by inference. Rank verified results by evidence-backed field/condition relevance, then funding status, then deadline, with deterministic tie-breakers. Missing facts cannot earn a positive fit conclusion.

## Response contract

- Return a versioned structured result and a Persian rendering of the same facts. Keep original official titles and short decisive source excerpts in their source language. Use stable field names, status vocabulary, order, and sections across result, zero-result, partial, and missing-input cases.
- Include request scope, check time, source/country coverage, API/web discovery methods, candidate and exclusion counts by reason, verified results, and a concise next action. Each result includes its kind, exact official posting/application link, institution, country, field/level, opening evidence, application mode and deadline, conditions, funding status/terms, nationality evidence status, source links, check dates, and local academic-fit gaps when applicant facts exist.
- Bound API/web calls and return a partial response when some sources fail or time out. Use `research_required` when no current official result can be verified and the missing source is material. Zero verified results and partial coverage never mean that no opportunities exist. Do not promise identical posting lists across time; the contract and decision rules remain stable while live sources change.

The response envelope keeps these fields in every state; empty arrays and explicit nulls replace absent sections:

```json
{
  "schemaVersion": "1.0.0",
  "status": "results | no_verified_results | needs_input | research_required",
  "checkedAt": "ISO date-time",
  "scope": { "field": "string or null", "targetCategory": "masters | phd | postdoc | research_job | null", "countriesRequested": [] },
  "coverage": { "status": "complete_within_budget | partial", "apiSources": [], "webSearches": [], "countriesChecked": [], "candidatesChecked": 0, "excludedByReason": {}, "truncated": false, "failures": [] },
  "results": [],
  "nextQuestion": null,
  "nextAction": "string or null"
}
```

`complete_within_budget` describes the stated bounded search only, never all available openings in a country or worldwide. Each result has stable `kind`, `targetCategory`, `applicationStatus`, `fundingStatus`, `nationalityEvidenceStatus`, official source links and excerpts, and verification dates. The Persian view must be generated from this validated envelope, not independently restated from raw search hits.

## Acceptance

- Public `executeTool` tests cover the stable response contract and gate conditions for all three result kinds across Master's and doctoral calls and doctoral/postdoctoral/research jobs, including zero results, missing field/level, source failure, deadline rollover, duplicate API/web discovery, unsupported funding, a competitive linked scholarship, unknown nationality, and explicit official exclusion.
- Provider contract tests use controlled API/feed responses; one dated live replay per source family checks real access, candidate mapping, official-page verification, and visible Persian output. At least one global request, one country-scoped request, one Master's admission plus broad applicable scholarship, one doctoral admission and funding call, and one PhD/postdoctoral/research vacancy are graded independently. A provider's successful response alone is not proof of an open call.
- Confirm external requests carry no private applicant facts and that the same public input yields the same normalized order and status under fixed provider fixtures. Verify source failures produce honest partial coverage rather than fabricated or stale openings.
- Run the repository's Node, release, static, and Python checks before committing. Run a public-only deployment smoke after release and compare the deployment commit.

## Existing boundaries

This expands the first German doctoral-physics slice without changing published evidence snapshots or turning a request result into a catalog. It does not implement professor discovery, university ranking, a separate plugin/backend, automatic monitoring, admission decisions, or immigration eligibility. No new ADR is proposed: source authority and publication/privacy decisions remain governed by the existing ADRs.
