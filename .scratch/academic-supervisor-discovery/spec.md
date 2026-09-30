# Academic Supervisor Lead — request-scoped first slice

Status: approved for the first slice by the owner.

## Problem

Hamrah can match named admissions programs and verify advertised funded doctoral openings. A user who wants to identify a relevant professor or research group for contact has no separate path. A faculty page can establish current research and public contact information, but does not establish student recruitment, admission, funding, or an open position.

## Proposed slice

On an explicit request, search current official university or research-institution pages within the user's country, degree goal, and research field. Return up to five named professors or groups whose current research has a source-linked connection to the requested topic. Show the official profile or group page, check date, exact research evidence, a public institutional contact channel when published, and student-recruitment status as `explicitly_accepting`, `explicitly_not_accepting`, or `unknown` only when the official source supports the stated status. Keep academic relevance and recruitment status separate. A user can request a stricter list containing only explicitly accepting supervisors.

The owner also wants to know whether the professor or group previously had an Iranian student. Seek a current public institutional page that explicitly links the former student to the professor or group and to Iran. Report `documented` with the reviewed source URL, or `unknown` when that evidence is absent or ambiguous. Do not infer nationality from a name, language, or appearance. Ordinary results omit the former student's name. A documented past connection does not imply current recruitment or favorable admission treatment.

The shortlist is request-scoped. Its public-fact renderer receives no applicant identity, personal academic history, or private reasons. A local step may compare the public research evidence with the applicant's stated research interests and disclose gaps. No contact is sent, and results are not published in a standing catalog.

## Acceptance

- A current official profile plus a specific research excerpt can produce a named lead with its source and check date.
- A faculty directory entry without research evidence cannot be presented as a topic match.
- An official research page alone leaves student-recruitment status `unknown`; it cannot become an open funded position or admissions program.
- A published institutional contact channel is linked only when it is present on an official page. No private address or inferred email format is generated.
- A stated accepting or not-accepting status requires a current, explicit official excerpt. An old or ambiguous statement remains `unknown`.
- A former Iranian student's connection requires explicit public institutional evidence of both the Iran connection and the former student relationship. Names are omitted from the ordinary result; missing evidence remains `unknown`.
- The result reports its checked scope and may contain fewer than three leads, including zero, without implying no relevant faculty exist.
- The public renderer rejects applicant-specific input and preserves a complete visible status block through `executeTool`.
- An anonymous bounded acceptance replay verifies the displayed excerpts against current official pages.

## Boundaries

Program admission, advertised opening availability, funding, employment, nationality eligibility, and visa outcomes require their own evidence paths. This slice neither sends emails nor collects contact details into published datasets. A user-selected university API is not assumed.

## Next slice: API-assisted discovery (owner-approved)

- A search returns a structured, evidence-backed report even when zero leads qualify. A fixed number of leads is not guaranteed.
- Individual professors and research groups may both appear, with an explicit result type.
- APIs generate and disambiguate candidates; current official institution pages establish the claims shown as verified. An API record alone does not establish current affiliation, topic match, contact, recruitment, or a funded opening.
- Use bounded, anonymous OpenAlex work search for candidate names and ROR for organization identity. A paid API key is not required. An API failure or quota limit is a coverage gap.
- Never show an API-only name in the final answer. Check a current official institutional page for every displayed lead, including names retrieved from the database.
- Search for a former Iranian student only for officially verified leads, within a bounded source review. Missing or ambiguous evidence is `unknown`.
- On every requested discovery, save the public professional candidate names and minimum source identifiers in the shared Redis REST database, scoped by a hash of the public search terms, with a 30-day expiry. Read cached candidates on later matching requests, but recheck their official pages before display. Do not persist applicant data, former-student names, contact details, page excerpts, or verification conclusions. Report cache outages; do not present cached names as verified.
- Run a fresh bounded API search even when the cache has candidates, to avoid hiding newly indexed research. If the API fails, cached names remain research hints for a bounded official-page search.
- The minimum search input is country, research field, and a specific topic. Ask only for a missing input that changes the search.
- If an API is unavailable or yields no officially verifiable leads, perform a bounded web search within the same requested scope and report the API failure and actual search coverage.
- Order qualifying results first by the strength of topic relevance supported on a current official page, then by evidence freshness and explicit recruitment status. Citation count and reputation do not supply an independent ranking boost.
