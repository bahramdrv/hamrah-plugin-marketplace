# Hamrah Official Eligibility Rules

## Purpose

Official Eligibility is the legal/official layer of the scorecard.

It must be determined before Community Signals are applied.

## Status values

### PASS
Use when current official information and applicant facts show the checked mandatory route requirements are satisfied.

### FAIL
Use when at least one current mandatory requirement is clearly not met.

A FAIL route:
- may retain a diagnostic Base Fit score;
- must have `usable_for_ranking=false`;
- must never be rescued by Community Signals, preferences, or university fit.

### POSSIBLE
Use when the route may be viable but:
- a required condition is not yet completed;
- a required offer/sponsor/nomination/endorsement is absent but obtainable;
- a material applicant fact is unknown;
- an official threshold depends on a future or external assessment.

POSSIBLE is not PASS.

### UNKNOWN
Use when the engine lacks sufficient current official route data to make a responsible legal assessment.

Examples:
- official rule set unavailable
- freshness too poor for a changed program
- conflicting official sources remain unresolved

UNKNOWN should normally be excluded from ranking until resolved.

---

## Source priority

Prefer:

1. immigration authority / government
2. official program page
3. embassy / consulate where relevant
4. official VAC/service provider for operations only
5. official regulator
6. official university/employer only for institution/employer requirements

Community sources never define official eligibility.

---

## Requirement records

Each checked requirement should include:

- `requirement_id`
- `title`
- `result`
- `explanation`
- `source_url`
- `source_title`
- `checked_at`

Allowed results:

- `met`
- `not_met`
- `unknown`
- `not_applicable`

Do not claim a requirement was checked without a supporting official source or configured trusted route dataset.

---

## Missing requirements vs blockers

### missing_requirements
Use when:
- information/document/condition is still unknown or incomplete;
- the route could still become viable.

### blockers
Use when:
- a current mandatory requirement is clearly not met;
- the route is currently FAIL.

---

## Freshness

Official facts that can change should carry an assessment date.

Examples:
- salary thresholds
- funds requirements
- fees
- processing targets
- route openings/closures
- occupation lists
- draw/category rules
- nomination rules

If freshness cannot be established and the fact is material:
- lower confidence;
- consider `UNKNOWN`.

---

## Hard separation

The following must never change Official Eligibility:

- community popularity
- anecdotal approval/refusal patterns
- applicant country preference
- lifestyle preference
- university preference
- resolved operational disruptions

Operational issues can reduce Practical Fit without changing legal eligibility.
