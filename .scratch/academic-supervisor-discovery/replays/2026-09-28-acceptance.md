# Academic Supervisor Lead bounded replay — 2026-09-28

Test request: “For astrobiology research in German physics, identify a professor or group to contact, and check whether former Iranian students are publicly documented.” This is an anonymous product test, not an applicant recommendation.

The [TU Berlin Astrobiology group-member page](https://www-astro.physik.tu-berlin.de/Astrobiology/node/18) loaded directly in the in-app browser on 2026-09-28. It identifies the group, links a recent project titled “Microbial Survival and Viability in Saline Environments on Mars (BRINES),” and publishes an institutional phone number in its Contact section. It lists former members but does not explicitly establish an Iranian connection for a former student. No statement about current PhD recruitment appeared on the inspected page. Both latter statuses therefore remain `unknown`. The public renderer input is in `2026-09-28-public-input.json`; it contains no applicant details or former student names. This is a one-candidate contract replay, not a user-requested faculty search.

| Check | Result | Observation |
| --- | --- | --- |
| Named group, topic excerpt, institutional contact | pass | The displayed project title and institutional phone match the official group-member page. A Contact heading alone now fails the renderer. |
| Recruitment distinct from research relevance | pass | The visible output says `unknown`; no accepting-students claim was made. |
| Former Iranian student evidence | pass for unknown boundary | No name or inferred Iranian connection was shown. The positive `documented` branch is covered by deterministic seam tests, not a live positive case. |
| Complete public status block | pass | `executeTool` returned `status: valid`, `leadCount: 1`, and its primary text equalled the returned Markdown. |
| Current page freshness | pass for this replay | The group-member page loaded directly in the in-app browser on 2026-09-28. The older group homepage was not used as decisive evidence. |
| Broad shortlist coverage | untested | One official candidate was inspected; this replay cannot establish that three to five leads are unavailable. |
| Applicant-visible answer and private fit note | untested | No applicant case was requested. A further browser click to inspect another research page was rejected by automatic approval review because this user message did not explicitly request a professor or group search. |

This replay verifies the contract's visible boundaries. It does not verify that this group is recruiting, funded, or currently connected to an Iranian student.
