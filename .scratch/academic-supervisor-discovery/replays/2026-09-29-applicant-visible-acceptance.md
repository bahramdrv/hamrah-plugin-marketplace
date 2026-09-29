# Academic Supervisor Lead visible acceptance — 2026-09-29

The owner asked to continue with the next ticket after NTNU connector work. This replays the already bounded anonymous group-search request for Germany / Physics / Astrobiology. It is an acceptance example, not a personalized professor recommendation.

- The [TU Berlin Astrobiology group page](https://www-astro.physik.tu-berlin.de/Astrobiology/node/18) loaded through a fresh direct browser connection on 2026-09-29. It names the group, lists the recent BRINES project, and publishes an institutional telephone contact. No current student-recruitment statement or explicit Iran connection for a former student appeared on that page.
- `2026-09-29-public-input.json` contains the public group facts and no applicant profile. `executeTool("renderAcademicSupervisorShortlist")` returned `status: valid`, `leadCount: 1`, and primary `content[0].text` exactly equal to `structuredContent.markdown`. The complete primary block is retained without restatement in `2026-09-29-visible-output.md` and is shown to the user in the final answer.
- The visible block keeps recruitment and former-Iranian-student status `unknown`, states the one-candidate search boundary, and makes no claim of admission, funding, or an open position. Because this anonymous request supplied no applicant facts, a private academic-fit note is inapplicable and none was created.

Grade: pass for this one-candidate, user-visible contract replay. Broader shortlist coverage remains untested; this result does not establish that there are no other relevant groups or that this group is accepting students.
