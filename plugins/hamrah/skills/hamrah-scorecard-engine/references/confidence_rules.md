# Hamrah Scorecard Confidence Rules

Confidence describes how reliable the assessment is.

It does not measure how good the route is.

## Levels

### High
Use when:
- applicant profile is sufficiently complete for the route;
- material official requirements are checked with current sources;
- score components are supported;
- any applied Community Signals are current and high/medium confidence;
- few material assumptions remain.

### Medium
Use when:
- core assessment is possible;
- some material applicant facts are incomplete;
- one or more official facts are partial/aging;
- Community Signals are mixed or only moderately supported;
- assumptions exist but do not destroy the assessment.

### Low
Use when:
- major profile facts are missing;
- official route data is incomplete/stale;
- route status is highly conditional;
- applied evidence is weak or contradictory;
- important assumptions drive the result.

## Automatic constraints

- `official_eligibility.status = UNKNOWN` should not have `high` confidence.
- `official_data_quality.status = missing` should not have `high` confidence.
- multiple unresolved blockers/missing requirements should lower confidence.
- a high score does not justify high confidence.

## Confidence reasons

Always include short reasons.

Good:
- "Current official route threshold was checked."
- "Language component scores are missing."
- "Community delay evidence is current but institution-specific."

Avoid:
- "The applicant seems credible."
- "This feels likely."
