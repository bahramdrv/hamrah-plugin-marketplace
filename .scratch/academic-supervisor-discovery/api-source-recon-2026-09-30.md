# API-assisted supervisor discovery: source reconnaissance (draft)

Status: facts checked on 2026-09-30; owner approved the bounded anonymous OpenAlex and ROR connector, official-page gate, and a shared candidate-name database.

## Source facts

- [OpenAlex's current API reference](https://help.openalex.org/api/llm-quick-reference/) offers author, work, institution, and topic endpoints. It says to resolve ambiguous names to IDs before filtering works. Search calls count against a daily usage budget: $0.10 without a key or $1 with a free key; over-budget requests return HTTP 429. It lists a 100-request-per-second ceiling and a maximum page size of 100. A bounded, anonymous probe can avoid account setup, but the source can become unavailable when the no-key budget is exhausted.
- [OpenAlex's author model](https://help.openalex.org/data/authors/) derives affiliations and topics from scholarly works. Consequently, a listed institution or topic is candidate evidence, not proof of current employment or present research activity on an official institutional page.
- [ROR's REST API](https://ror.readme.io/docs/rest-api) searches organization records at `/v2/organizations`, supports location and organization-type filters, and currently needs no registration. Its published limit is 2,000 requests per five minutes per IP. [ROR's client-ID page](https://ror.readme.io/docs/client-id) says registration is temporarily paused and ID-based limits are not yet enforced; the planned no-ID limit is lower. ROR identifies institutions, not professors or student-recruitment status.
- A bounded live query on 2026-09-30 returned OpenAlex HTTP 429 with an anonymous-search temporary rate-limit message, then HTTP 200 on retry. The result included coauthors at institutions outside the requested country and a German company affiliation in a country-filtered work. The connector must filter each authorship's institution country and exclude company institutions before returning names. A ROR `/v2/organizations/<id>` live probe returned `id` and `locations[].geonames_details.country_code` as expected.

## Existing Hamrah boundary

`renderAcademicSupervisorShortlist` accepts only caller-supplied, source-linked public lead facts. It does not retrieve pages or API records. Its current input covers up to five leads and requires the checked official candidate count to equal displayed plus excluded candidates. `academic_supervisor_leads.md` requires an explicit user request, current official research evidence, separate recruitment and former-Iranian-student states, and no applicant profile in the public renderer.

## Decisions recorded

API-only names stay internal; former-Iranian-student research is limited to officially verified leads. The first connector uses anonymous OpenAlex and ROR. Each discovery stores minimal public professional candidate names in shared Redis REST with a short expiry; subsequent requests use those names as research hints and repeat official-page verification before showing any lead. OpenAlex/ROR data never establishes current recruitment, admission, or funding.
