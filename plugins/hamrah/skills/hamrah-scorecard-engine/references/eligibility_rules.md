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
- `claim_type` and versioned `source_authority` (`policy_version`, `classification`, `rule_id`)
- `retrieved_at`, `effective_from`, and `effective_until` (null when no end date is known)
- `fact_type` and versioned `freshness` (`policy_version`, `fact_type`, `status`, `age_days`, `max_age_days`)

The validator classifies the source URL using `source_authority_policy.json`. A rule must match the claim type, requirement ID, exact title and result explanation, country, route, HTTPS host, and exact path. The supplied `source_authority` must match that computed classification; a title or claimed authority cannot substitute for a rule. Policy version 1.0.0 contains one reviewed primary rule for the secured-livelihood condition in Germany's Opportunity Card. Add other source and claim pairs to the versioned policy after review. The policy controls which legal claim a source can support; validation of the applicant's evidence remains a separate step.

For `met` or `not_met`, a real scoped source URL and all authority and date fields are mandatory. An unrecognized or mismatched source remains `unknown`, with `assessment_kind: "provisional"` and nondecisive official eligibility. `PASS` and `FAIL` require `assessment_kind: "official"` and checked authoritative requirements.

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

Dates must be real ISO values. `generated_at`, `profile_generated_at`, and `retrieved_at` are date-times with a timezone (`2026-09-11T00:00:00Z`); `effective_from` and `effective_until` are dates (`2026-09-11`); `checked_at`, `published_at`, and `official_data_quality.as_of` accept either. Impossible calendar values, an `effective_until` before `effective_from`, and a `checked_at`, `retrieved_at`, or `published_at` after `generated_at` are validation errors. A `met` or `not_met` requirement cannot cite a rule whose `effective_from` is after `generated_at`.

The validator computes each requirement's `freshness` from `references/freshness_policy.json` and the supplied `freshness` must match it. Age is the number of UTC calendar days from `retrieved_at` to `generated_at`. Policy version 1.0.0 covers `salary_threshold`, `fee`, `occupation_list`, `deadline`, `quota`, `processing_time`, `financial_requirement`, and `statutory_condition`:

- `current`: age is at most the fact type's `aging_after_days`;
- `aging`: age is at most `max_age_days` (the validator warns for decisive requirements);
- `stale`: age exceeds `max_age_days`, or `effective_until` is before `generated_at`;
- `unknown`: `retrieved_at` is missing or the fact type is not in the policy. An unknown date is never treated as current.

A `met` or `not_met` requirement that is `stale` or `unknown` blocks ranking. Set `usable_for_ranking: false`, do not report `official_data_quality.status: "current"`, and add a `practical_fit.ranking_blockers` entry with the `requirement_id`, code `stale_decisive_requirement` or `unknown_freshness`, and a reason. A rankable route cannot list ranking blockers.

If freshness cannot be established and the fact is material, lower confidence and consider `UNKNOWN`.

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
