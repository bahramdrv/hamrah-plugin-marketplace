---
name: hamrah-scorecard-engine
description: Use when a normalized Hamrah applicant profile must be evaluated against current official immigration route data and applicable community signals to produce an explainable route-by-route immigration scorecard.
---

# Hamrah Scorecard Engine

## Overview

Evaluate immigration routes using three strictly separated layers:

1. **Official Eligibility** — legal/official route status
2. **Base Fit** — profile-to-route fit
3. **Community Adjustment** — current real-world friction only

The engine produces an explainable scorecard. It does not collect the applicant profile, normalize free text, or recommend universities.

## Inputs

The engine expects:

- a normalized Hamrah applicant profile;
- current official route context from the Hamrah Visa Atlas MCP tools or primary official sources;
- applicable normalized Community Signals.

If official route context is unavailable, do not invent it. Mark official eligibility `UNKNOWN`.

## Required References

- `references/scorecard_schema.json`
- `references/scoring_rubric.md`
- `references/eligibility_rules.md`
- `references/community_adjustment_rules.md`
- `references/confidence_rules.md`

Use examples for output style:
- `examples/strong_route.json`
- `examples/conditional_route.json`
- `examples/failed_route.json`

## Workflow

### 1. Confirm applicant profile readiness
Use the normalized profile as the factual applicant state.

Do not reinterpret missing values as negative facts.

If critical route-specific information is missing, record it under `missing_information`.

### 2. Evaluate official eligibility first
Check current official route requirements before scoring.

Set one:
- `PASS`
- `FAIL`
- `POSSIBLE`
- `UNKNOWN`

Official eligibility is a gate. Community evidence cannot change it.

### 3. Score Base Fit
Use the 100-point rubric in `references/scoring_rubric.md`.

Weights:
- Eligibility fit: 30
- Career/profile fit: 20
- Financial fit: 15
- Process practicality: 10
- Long-term potential: 10
- Goal alignment: 10
- Evidence quality: 5

Do not hide component reasoning.

### 4. Apply Community Adjustment
Match only signals that actually apply to the applicant, route, process stage, institution/provider, location, and timing.

Allowed total adjustment:
`0, -5, -10, -15, -20`

Community evidence:
- may reduce practical fit;
- may remove an outdated penalty when resolved;
- may never add positive points;
- may never turn `FAIL` into `PASS`;
- may never create an official requirement.

Avoid double counting correlated signals.

### 5. Compute Practical Fit
When Base Fit is available:

`Practical Fit = Base Fit + Community Adjustment`

Clamp only at 0 if a negative adjustment would otherwise produce a negative number.

For `FAIL`, the diagnostic score may still be shown, but `usable_for_ranking` must be `false`.

For `UNKNOWN`, route ranking should normally be disabled until official data is available.

### 6. Set confidence
Use `references/confidence_rules.md`.

Confidence reflects evidence quality and completeness, not route attractiveness.

### 7. Build portfolio summary
Only routes with `usable_for_ranking=true` may appear in `strongest_routes`.

Blocked routes belong in `blocked_routes`.

Preferences and university matching must not alter Base Fit or Practical Fit.

### 8. Validate
Run:

`python scripts/validate_scorecard.py hamrah_scorecard.json`

Fix all errors before returning the scorecard.

## Non-Negotiable Rules

- Official rule > community evidence.
- `FAIL` never becomes rankable because of a high profile score.
- Positive community evidence never adds fit points.
- Resolved/historical community events contribute `0`.
- Missing official data must not be silently replaced with model knowledge.
- Preference match is separate from feasibility.
- University/program matching is outside this skill.
- Do not present score as visa approval probability.

## Output

Default filename:

`hamrah_scorecard.json`

Return the file and, if requested, a short human-readable summary.
