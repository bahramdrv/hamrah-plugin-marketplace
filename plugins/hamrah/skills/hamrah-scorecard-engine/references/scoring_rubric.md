# Hamrah Scorecard Scoring Rubric

## Core model

Base Fit is scored out of 100.

Community friction is applied afterwards.

```text
Practical Fit = Base Fit + Community Adjustment
```

Community Adjustment is never positive.

## Component weights

| Component | Max |
|---|---:|
| Eligibility fit | 30 |
| Career / profile fit | 20 |
| Financial fit | 15 |
| Process practicality | 10 |
| Long-term potential | 10 |
| Goal alignment | 10 |
| Evidence quality | 5 |
| **Total** | **100** |

---

## 1. Eligibility fit — 30

This score measures how completely the applicant satisfies current official route requirements.

### PASS
Typical range: `26–30`

Use 30 only when:
- core requirements are clearly satisfied;
- no material required evidence is missing;
- current official data is available.

### POSSIBLE
Typical range: `10–25`

Use when:
- route appears potentially available;
- one or more conditions, assessments, thresholds, offers, nominations, licences, or documents are not yet satisfied/confirmed;
- missing information could change the result.

### FAIL
Use `0`.

A FAIL route may still receive scores in other components for diagnostic value, but it is not rankable.

### UNKNOWN
If official route data is missing or too stale to assess safely:
- eligibility component should normally be `null`;
- Base Fit total should normally be `null`;
- route should not be ranked.

Do not infer official eligibility from community anecdotes.

---

## 2. Career / profile fit — 20

Measures match between the applicant's profile and the route's practical target population.

Consider only route-relevant factors such as:
- occupation / field
- years and relevance of experience
- academic/research strength
- seniority
- employer/sponsor fit
- portfolio/achievements
- licensing readiness
- competitive profile strength where applicable

Guide:
- `17–20`: very strong
- `13–16`: strong
- `8–12`: moderate
- `1–7`: weak
- `0`: no meaningful fit

Do not create unofficial legal requirements.

---

## 3. Financial fit — 15

Consider:
- official required funds
- fees and cost-to-complete
- tuition/deposits where relevant
- relocation runway
- sponsor/funding reliability
- ability to absorb realistic process cost

Guide:
- `13–15`: comfortably feasible
- `10–12`: feasible with manageable constraints
- `6–9`: material pressure
- `1–5`: severe financial mismatch
- `0`: cannot currently execute

Use current official financial thresholds where they exist.

---

## 4. Process practicality — 10

This is Base Fit practicality **before Community Adjustment**.

Consider structural route characteristics such as:
- number of mandatory steps
- need for sponsor/nomination/endorsement
- licensing/assessment dependency
- timing flexibility
- availability of required infrastructure
- applicant's geographic constraints

Do not duplicate current community friction here if it is already represented by a Community Signal.

Guide:
- `9–10`: straightforward
- `7–8`: manageable
- `4–6`: complex
- `1–3`: very difficult
- `0`: practically unavailable

---

## 5. Long-term potential — 10

Assess alignment with the applicant's stated long-term objective.

Examples:
- route leads directly or credibly toward settlement when settlement is a goal
- route has weak transition options when long-term settlement is important
- route is strong for temporary mobility when applicant does not require permanence

Guide:
- `9–10`: excellent
- `7–8`: good
- `4–6`: mixed
- `1–3`: weak
- `0`: conflicts with stated long-term goal

Do not promise permanent residence or citizenship.

---

## 6. Goal alignment — 10

Measures whether the route matches the applicant's immediate purpose.

Examples:
- funded PhD goal → research/doctoral route
- employer-sponsored work goal → sponsored work route
- entrepreneur goal → startup/entrepreneur route

Guide:
- `9–10`: direct match
- `7–8`: strong alternative
- `4–6`: partial match
- `1–3`: weak detour
- `0`: conflicts with stated goal

---

## 7. Evidence quality — 5

Measures confidence in the data used to score.

Consider:
- applicant profile completeness
- explicit vs inferred facts
- date/currentness
- quality of official route data
- whether key evidence is documented or merely claimed

Guide:
- `5`: highly complete/current
- `4`: strong
- `3`: adequate
- `2`: important gaps
- `1`: major uncertainty
- `0`: insufficient basis

This is not a credibility judgment about the person. It reflects assessment completeness.

---

## Base Fit calculation

If all component scores are numeric:

```text
Base Fit = sum(component scores)
```

If official eligibility is `UNKNOWN` because official route data is unavailable:
- use `null` Base Fit unless a downstream product explicitly requests a provisional non-ranking score.

---

## Practical Fit interpretation

Suggested labels:

- `85–100`: excellent
- `70–84`: strong
- `55–69`: moderate
- `40–54`: weak
- `0–39`: very weak

These labels describe practical route fit, not approval probability.

`FAIL` and `UNKNOWN` override the numeric label for ranking purposes.
