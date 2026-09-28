# Anonymous acceptance replay — 2026-09-28

This is a bounded, request-scoped check of funded doctoral physics openings in Germany. Both profiles are fictional. The [exact public renderer input](2026-09-28-public-input.json) and [complete visible answers](2026-09-28-visible-output.md) record the `executeTool("renderVerifiedOpenAcademicOpportunityShortlist", ...)` call and subsequent local fit-note formatting. Inspection of the public input shows only scope, coverage, and public opening facts; no profile facts or private fit reasons were sent. The input is dated: the renderer's freshness gate will reject the same fixture after its check date. This record is not a standing opportunity catalog; opening status needs rechecking before any later use.

## Current official pages checked

| Candidate | Official evidence checked | Replay decision |
| --- | --- | --- |
| Hamburg, modeling non-local interactions | [Actual advertisement](https://stellen.uni-hamburg.de/jobposting/78344fe75700d155e4528290a845337c21ae8019): exact research-associate title, possibility of a doctoral degree, physics MSc and condensed-matter conditions, EGR. 13 TV-L salary at 75% weekly hours, contract through November 2029, 12 October 2026 deadline, and linked online application form. | Shown. The dated application instruction and live form establish acceptance at the check date. |
| Hamburg, compact hot stars | [Actual advertisement](https://stellen.uni-hamburg.de/jobposting/8d8889efd47d2917caf51813821a63226bc38f9d): exact title, astrophysics conditions, EGR. 13 TV-L salary at 66.67% weekly hours, three-year contract, 15 October 2026 deadline, and linked online application form. The university's [doctoral researcher listing](https://www.qu.uni-hamburg.de/cluster/jobs/research-positions.html) identifies this advertisement as a PhD position. | Shown. |
| Hamburg, displacement sensors | [Actual advertisement](https://stellen.uni-hamburg.de/jobposting/16463b8200a6ceaea7505443acb6b36d0f16e9e9): deadline 24 May 2026. | Excluded as `expired_deadline`. The still visible form text does not override the expired date. |
| IMPRS-QDC application round | [Official application procedure](https://www.imprs-pks.mpg.de/application/application-procedure): October 2026 deadline and application steps, but no specific salary scale, amount and period, or named stipend terms on the page checked. | Excluded as `unverified_funding`; this is a coverage limit, not an assertion that funding does not exist elsewhere. |

The displayed title, academic-condition, salary, deadline, and application excerpts were compared directly with each cited advertisement. Whitespace between the deadline and application-form instruction was normalized in the renderer input. The two displayed advertisements did not state a decisive Iranian-nationality rule, so their evidence status is `unknown`. No real advertisement in this bounded search supplied an explicit official Iranian exclusion; the source-linked exclusion path is covered by deterministic `executeTool` tests and is **untested against a live exclusion** here.

## Replay grades

`pass` means the observable output met the expectation on this dated check. `untested` means the scenario did not supply evidence for that behavior; it is not a pass.

| Expected behavior | Minimal profile | Material academic gaps |
| --- | --- | --- |
| Actual advertised doctoral physics opening, current acceptance, future deadline | pass | pass |
| Official salary scale, workload, and contract duration shown separately from application status | pass | pass |
| Academic fit covers all five and three published conditions using only supplied facts; missing proof remains a gap | pass: all conditions `unverified` | pass: supplied MSc supported; stated missing experience `not_met`; omitted preferred backgrounds `unverified` |
| Iranian-nationality silence remains `unknown` | pass | pass |
| Explicit official Iranian restriction removed with source | untested live; deterministic seam test pass | untested live; deterministic seam test pass |
| Scope stays Germany / PhD / Physics; four checked candidates, two exclusions, two shown | pass | pass |
| Complete validated public blocks and source-linked private fit notes survive in the visible answer | pass | pass |
| Stops at opening search and fit, without a standing catalog, admission chance, or visa conclusion | pass | pass |

The next action for either sample is to recheck the selected application page before applying. The material-gap sample should also assemble evidence for the missing research background. The replay did not infer nationality eligibility or an immigration outcome.
