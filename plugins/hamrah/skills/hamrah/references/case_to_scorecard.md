# Case to scorecard contract

## 1. Receive the case

Accept one complete narrative, supplied documents, structured applicant JSON, or incremental answers. Read the available case before selecting follow-up questions. Record contradictions and missing facts through the profile normalizer. Completion means every supplied relevant fact has been considered, not that every possible intake field has been filled.

## 2. Normalize facts

Use the profile normalizer's schema, rules and validation. Normalization standardizes facts and units/labels as allowed by that skill; it does not create a universal immigration score. Preserve GPA scales, test components and currencies. An existing user-supplied score needs its named system, scale, date and evidence; it is not a Hamrah score.

Proceed with enough route-relevant information. Ask only a missing question that could materially change screening. Missing fields for unrelated routes do not block a specific-program evaluation. Preserve unknown facts as unknown.

## 3. Compare programs

### Preferences and candidate selection

During adaptive intake, establish immediate purpose, long-term goal, preferred/excluded destinations, timeline, and hard constraints when relevant and not already supplied. One high-value question at a time is the default. Record unknown preferences as unknown; they need not block initial screening.

Distinguish hard constraints (such as a strict budget or an excluded destination) from soft preferences (such as climate or a favored country). Respect explicit exclusions in the shortlist unless the user asks to inspect them. Include specifically requested programs for assessment even when weak; label blocked options honestly. A favored country alone does not prove feasibility.

Present personal preference match separately for each evaluated route, with reasons and unknowns. Maintain feasibility ranking by Practical Fit. When useful, also identify which feasible options best match stated preferences, clearly labeled as a separate preference view. Goal alignment and long-term potential remain the engine's existing rubric components; lifestyle/country preferences add no extra fit points. Avoid counting a stated goal twice as both a rubric component and a preference bonus.

Retrieve current program-specific requirements through the API workflow and linked primary sources. Use actual program identities from source records, with country and route identifiers. A country-level overview is not a program assessment.

For every candidate program, record an internal requirement comparison:

| Requirement | Official threshold or condition | Applicant fact | Result | Source and date |
|---|---|---|---|---|
| Each applicable mandatory condition | Current rule | Explicit normalized fact or unknown | met / not_met / conditional / unknown | Primary URL and review/effective date |

Cover all applicable mandatory criteria, including occupation, age, education, language, experience, funds, offer/sponsor, licensing or nomination where required. Map this evidence into the existing scorecard schema's requirement/reason fields rather than adding unsupported JSON fields. Do not treat missing evidence as a failed requirement. Distinguish an unmet legal requirement from an achievable future dependency using the engine's eligibility rules.

If the program uses official points, compute them only from its current official rubric and sufficient applicant facts. Preserve the official system's name, scale, components and source in the assessment reasoning. Do not convert CRS or another official points system directly into Hamrah Base Fit. A draw cutoff is not an approval probability or a universal eligibility threshold.

Completion means each evaluated program has traceable requirements and an eligibility determination, or explicit unresolved facts supporting UNKNOWN/POSSIBLE. Missing official data must not lead to an invented score.

## 4. Calculate per-program fit

Use the scorecard engine's existing seven-component 100-point rubric. Each component needs reasons tied to applicant facts and that program. Sum component scores for Base Fit and apply only applicable normalized community adjustments for Practical Fit. Keep official points and personal preferences separate. Missing community coverage means adjustment zero plus a coverage warning.

## 5. Deliver the scorecard

Validate the canonical scorecard before presenting it. Follow the presentation reference: program/country, eligibility, Base Fit, community adjustment, Practical Fit, confidence, reasons, blockers and next action. Rank only eligible-for-ranking records; never recommend FAIL or UNKNOWN on the strength of numeric scores. Show requested blocked programs separately. If evidence prevents scoring, issue a clearly incomplete assessment with missing facts and the next useful question rather than a fabricated complete card.

Internal JSON remains available for validation and user-requested export. Normal applicant conversations receive the readable scorecard. This is an agent-driven workflow requiring live HTTP/browsing for screening; it is not a standalone deterministic application.

## Reuse across conversations

Within the current conversation, retain canonical applicant state and references to validated community datasets. Shared datasets published under the plugin repository's `plugins/hamrah/data/community-signals/datasets/` become available across devices through the read-only MCP tools after a successful deployment. Applicant records, raw exports, and newly generated local datasets are not synchronized automatically. Offer applicant-state export when the user wants to resume elsewhere; never imply that personal case data is stored in the shared signal repository.
