# API/cache to official-page acceptance — 2026-10-01

Scope: anonymous development replay for Germany / Computer Science / Machine Learning. No applicant profile was provided.

The deployed discovery tool returned 12 unverified candidates, `cacheRead: hit`, `cacheWrite: saved`, `apiStatus: searched`, three successful ROR organization checks, and no provider failures. Four candidates were selected for a bounded official-page review; eight were not checked and remain unknown. The full API response stayed in temporary storage; this record preserves only the facts needed to review the acceptance.

## Official-page decisions

- **Benjamin Risse:** the [University of Münster profile](https://www.uni-muenster.de/AlleInformatiken/professoren/risse.shtml) identifies a current professor, lists Machine Learning with Deep Learning and Pattern Recognition as research interests, and publishes an institutional contact address. Included. The page also shows current 2026/27 teaching and research projects.
- **Niklas Kühl:** the [University of Bayreuth profile](https://www.wi.uni-bayreuth.de/de/team/niklas_kuehl/index.php) identifies the current chair for Information Systems and Human-Centric Artificial Intelligence and publishes an institutional contact address. The [official Philosophy & Computer Science faculty page](https://www.philcs.uni-bayreuth.de/en/faculty/index.html) explicitly lists fairness in machine learning as his research focus. Included under this applied computing focus. The OpenAlex candidate's KIT affiliation was not carried into the output; the official current institution is Bayreuth.
- **Priya Donti:** the [MIT EECS profile](https://www.eecs.mit.edu/people/priya-donti/) identifies a current assistant professor at MIT. The German institutional hint from the API did not establish current employment in Germany. Excluded from this bounded German shortlist as out of scope; this is not a claim that she has no other affiliations.
- **Anne-Laure Boulesteix:** the [LMU profile](https://www.en.ibe.med.uni-muenchen.de/mitarbeiter/professoren/boulesteix/index.html) establishes a professorship in biometry with a molecular-medicine focus, and the [research page](https://www.en.ibe.med.uni-muenchen.de/mitarbeiter/professoren/boulesteix/lebenslauf2/index.html) includes machine learning. A Computer Science supervision context was not established in this bounded review, so she was conservatively excluded rather than broadening the field.

## Separate evidence states

No explicit current accepting/not-accepting graduate-student statement was found in the reviewed profile/research pages for the two included leads. Their recruitment status is `unknown`.

One official-domain search per included lead checked the professor name with Iran and student terms. No explicit public institutional evidence established both a former-student relationship and an Iran connection. The statuses remain `unknown`; this does not establish that no former Iranian student exists. An unrelated Iran mention elsewhere on a multi-person university page was not treated as evidence.

## Fresh retrieval and rendering

Direct, fresh HTTP retrievals of the Münster profile, Bayreuth profile, and Bayreuth faculty page all returned 200. The displayed name/research/contact terms were present. The faculty page encoded the umlaut in the name as an HTML entity; decoding it confirmed that the name and research focus appear together.

The deployed `renderAcademicSupervisorShortlist` accepted `2026-10-01-api-cache-public-input.json`, returned `leadCount: 2`, and its primary text equalled `structuredContent.markdown` exactly. The complete block is saved in `2026-10-01-api-cache-visible-output.md`. Coverage is four official candidates checked, two displayed, two excluded, with eight API candidates unsearched. No funding, admission, or recruitment conclusion was inferred from research relevance.
